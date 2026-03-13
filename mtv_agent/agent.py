"""The agent tool loop -- simple, readable, no framework magic."""

import asyncio
import copy
import json
import logging
import time
from collections.abc import AsyncGenerator, Callable, Awaitable

from openai import APIError

from mtv_agent.lib.llm import LLMClient
from mtv_agent.lib.system_prompt import build_system_prompt
from mtv_agent.lib.virtual_tools import (
    SELECT_SKILL_TOOL_NAME,
    SET_CONTEXT_TOOL_NAME,
    make_select_skill_tool,
    make_set_context_tool,
)
from mtv_agent.lib.text_utils import DEFAULT_TRUNCATE_LIMIT, truncate
from mtv_agent.lib.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)

DEFAULT_MAX_ITERATIONS = 20
DEFAULT_MAX_RETRIES = 2
DEFAULT_RETRY_DELAY = 2.0
DEFAULT_MEMORY_TOOL_RESULT_LIMIT = 4000


ApproveResult = tuple[bool, str | None]
ApproveFn = Callable[[str, dict], Awaitable[ApproveResult]]


def _prepare_turn_messages(
    messages: list[dict],
    turn_start: int,
    final_text: str,
    tool_result_limit: int,
) -> list[dict]:
    """Build the message list to persist for one conversation turn.

    Slices *messages[turn_start:]* (user msg through tool-call rounds),
    appends the final assistant text, and truncates tool-result content
    so stored history stays compact.
    """
    turn = copy.deepcopy(messages[turn_start:])
    turn.append({"role": "assistant", "content": final_text})
    for msg in turn:
        if msg.get("role") == "tool" and isinstance(msg.get("content"), str):
            msg["content"] = truncate(msg["content"], tool_result_limit)
    return turn


def _checkpoint_messages(
    messages: list[dict],
    turn_start: int,
    tool_result_limit: int,
) -> list[dict]:
    """Snapshot the current turn for incremental disk persistence.

    Like *_prepare_turn_messages* but without appending a final assistant
    reply (which doesn't exist yet mid-turn).
    """
    turn = copy.deepcopy(messages[turn_start:])
    for msg in turn:
        if msg.get("role") == "tool" and isinstance(msg.get("content"), str):
            msg["content"] = truncate(msg["content"], tool_result_limit)
    return turn


async def run_stream(
    user_message: str,
    registry: ToolRegistry,
    llm: LLMClient,
    context_window: int = 8192,
    approve_fn: ApproveFn | None = None,
    history: list[dict] | None = None,
    initial_skills: list[str] | None = None,
    max_active_skills: int = 3,
    context: dict[str, str] | None = None,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
    tool_result_limit: int = DEFAULT_MEMORY_TOOL_RESULT_LIMIT,
) -> AsyncGenerator[dict, None]:
    """Run the tool loop, yielding events as they happen.

    Events:
        {"event": "thinking"}
        {"event": "checkpoint",  "messages": [...]}
        {"event": "skill_selected", "name": "..."}
        {"event": "skill_cleared"}
        {"event": "context_set",   "key": "...", "value": "..."}
        {"event": "context_unset", "key": "..."}
        {"event": "usage",       "total_tokens": N, "prompt_tokens": N, "context_window": N}
        {"event": "tool_call",   "name": "...", "arguments": {...}}
        {"event": "tool_denied", "name": "..."}
        {"event": "tool_result", "name": "...", "result": "..."}
        {"event": "content",     "content": "..."}
        {"event": "done",        "content": "...", "messages": [...]}
    """
    skills = registry.skills
    ctx = dict(context) if context else {}

    active_skills: list[str] = []
    for name in initial_skills or []:
        resolved = skills.resolve(name)
        if resolved and resolved not in active_skills:
            active_skills.append(resolved)
            yield {"event": "skill_selected", "name": resolved}
    active_skills = active_skills[-max_active_skills:]

    def _skill_sections() -> list[tuple[str, str]]:
        sections = []
        for name in active_skills:
            body = skills.get_body(name)
            if body:
                sections.append((name, body))
        return sections

    def _system_prompt() -> str:
        return build_system_prompt(_skill_sections(), ctx or None)

    messages: list[dict] = [
        {"role": "system", "content": _system_prompt()},
        *(history or []),
        {"role": "user", "content": user_message},
    ]
    turn_start = len(messages) - 1  # index of the new user message

    yield {
        "event": "checkpoint",
        "messages": _checkpoint_messages(messages, turn_start, tool_result_limit),
    }

    base_tools = registry.get_tool_definitions()
    skill_tool = make_select_skill_tool(skills)
    if skill_tool:
        base_tools.append(skill_tool)
    base_tools.append(make_set_context_tool())
    tools = base_tools or None

    for _ in range(max_iterations):
        yield {"event": "thinking"}

        response = None
        for attempt in range(1, max_retries + 1):
            try:
                response = await llm.chat(messages, tools)
                break
            except APIError as exc:
                logger.warning(
                    "LLM request failed (attempt %d/%d): %s",
                    attempt,
                    max_retries,
                    exc,
                )
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)

        if response is None:
            msg = "The language model is unavailable. Please try again or switch to a different model."
            turn = _prepare_turn_messages(messages, turn_start, msg, tool_result_limit)
            yield {"event": "content", "content": msg}
            yield {"event": "done", "content": msg, "messages": turn}
            return

        choice = response.choices[0]
        message = choice.message

        usage = response.usage
        if usage:
            yield {
                "event": "usage",
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens,
                "context_window": context_window,
            }

        if choice.finish_reason != "tool_calls" or not message.tool_calls:
            final = message.content or ""
            turn = _prepare_turn_messages(
                messages, turn_start, final, tool_result_limit
            )
            yield {"event": "content", "content": final}
            yield {"event": "done", "content": final, "messages": turn}
            return

        messages.append(message.model_dump())

        for tool_call in message.tool_calls:
            name = tool_call.function.name
            arguments = json.loads(tool_call.function.arguments)

            yield {"event": "tool_call", "name": name, "arguments": arguments}

            if approve_fn:
                approved, reason = await approve_fn(name, arguments)
            else:
                approved, reason = True, None

            if not approved:
                logger.info("Tool call denied: %s", name)
                if reason:
                    result = f"Tool call denied by user. Reason: {reason}"
                else:
                    result = "Tool call denied by user."
                yield {"event": "tool_denied", "name": name, "reason": reason}
                yield {"event": "tool_result", "name": name, "result": result}

            elif name == SELECT_SKILL_TOOL_NAME:
                requested = arguments.get("name", "none")
                resolved = skills.resolve(requested)
                if resolved:
                    if resolved in active_skills:
                        result = (
                            f"Reference guide '{resolved}' is already loaded. "
                            "No action needed — do NOT call select_skill again "
                            "for this guide."
                        )
                        logger.info("Skill already active: %s", resolved)
                    else:
                        active_skills.append(resolved)
                        if len(active_skills) > max_active_skills:
                            active_skills[:] = active_skills[-max_active_skills:]
                        result = f"Reference guide '{resolved}' loaded."
                        yield {"event": "skill_selected", "name": resolved}
                        logger.info("Skill selected: %s", resolved)
                        messages[0]["content"] = _system_prompt()
                else:
                    active_skills.clear()
                    result = "All reference guides cleared."
                    yield {"event": "skill_cleared"}
                    logger.info("Skills cleared")
                    messages[0]["content"] = _system_prompt()
                yield {"event": "tool_result", "name": name, "result": result}

            elif name == SET_CONTEXT_TOOL_NAME:
                key = arguments.get("key", "").strip()
                value = arguments.get("value", "").strip()
                if key and value:
                    ctx[key] = value
                    result = f"Context set: {key}={value}"
                    yield {"event": "context_set", "key": key, "value": value}
                    logger.info("Context set: %s=%s", key, value)
                elif key:
                    ctx.pop(key, None)
                    result = f"Context unset: {key}"
                    yield {"event": "context_unset", "key": key}
                    logger.info("Context unset: %s", key)
                else:
                    result = "No key provided."
                messages[0]["content"] = _system_prompt()
                yield {"event": "tool_result", "name": name, "result": result}

            else:
                logger.info("Tool call: %s(%s)", name, arguments)
                t0 = time.perf_counter()
                try:
                    result = await registry.execute_tool(name, arguments)
                except Exception as exc:
                    logger.error("Tool %s raised %s: %s", name, type(exc).__name__, exc)
                    result = f"Tool error: {exc}"
                elapsed = time.perf_counter() - t0
                logger.info("Tool %s executed in %.3fs", name, elapsed)
                yield {"event": "tool_result", "name": name, "result": result}

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": truncate(result, DEFAULT_TRUNCATE_LIMIT),
                }
            )

        yield {
            "event": "checkpoint",
            "messages": _checkpoint_messages(messages, turn_start, tool_result_limit),
        }

    msg = "Reached maximum tool call iterations."
    turn = _prepare_turn_messages(messages, turn_start, msg, tool_result_limit)
    yield {"event": "content", "content": msg}
    yield {"event": "done", "content": msg, "messages": turn}


async def run(
    user_message: str,
    registry: ToolRegistry,
    llm: LLMClient,
    history: list[dict] | None = None,
    initial_skills: list[str] | None = None,
    max_active_skills: int = 3,
    context: dict[str, str] | None = None,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
    tool_result_limit: int = DEFAULT_MEMORY_TOOL_RESULT_LIMIT,
) -> tuple[str, list[dict]]:
    """Non-streaming wrapper -- returns (answer, turn_messages)."""
    content = ""
    turn_messages: list[dict] = []
    async for event in run_stream(
        user_message,
        registry,
        llm,
        history=history,
        initial_skills=initial_skills,
        max_active_skills=max_active_skills,
        context=context,
        max_iterations=max_iterations,
        max_retries=max_retries,
        retry_delay=retry_delay,
        tool_result_limit=tool_result_limit,
    ):
        if event["event"] == "content":
            content = event["content"]
        elif event["event"] == "done":
            turn_messages = event.get("messages", [])
    return content, turn_messages
