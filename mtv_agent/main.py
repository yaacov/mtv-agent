"""FastAPI application -- /chat endpoint with startup hooks."""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from starlette.responses import FileResponse

from mtv_agent import agent
from mtv_agent.config import config_path, load_mcp_servers, raw_config, settings
from mtv_agent.lib.chat_store import ChatStore
from mtv_agent.lib.llm import LLMClient, discover_context_window, discover_model
from mtv_agent.lib.mcp_manager import MCPManager
from mtv_agent.lib.memory import ChatMemory
from mtv_agent.lib.playbooks import PlaybooksManager
from mtv_agent.lib.skills import SkillsManager
from mtv_agent.lib.text_utils import first_sentence
from mtv_agent.lib.tool_registry import ToolRegistry

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

registry: ToolRegistry
llm: LLMClient
memory: ChatMemory
chat_store: ChatStore
mcp_manager: MCPManager
playbooks_manager: PlaybooksManager

# Pending approval queues keyed by session ID.
_approval_queues: dict[str, asyncio.Queue[tuple[bool, str | None]]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: discover model, connect MCP, load skills, build registry."""
    global registry, llm, memory, chat_store, mcp_manager, playbooks_manager

    # --- LLM -----------------------------------------------------------------
    model = settings.llm_model
    if not model:
        logger.info(
            "No LLM_MODEL set -- auto-discovering from %s", settings.llm_base_url
        )
        try:
            model = await discover_model(settings.llm_base_url, settings.llm_api_key)
        except Exception as exc:
            logger.warning(
                "Could not reach LLM server at %s: %s. "
                "Start the server and select a model via the UI or set LLM_MODEL.",
                settings.llm_base_url,
                exc,
            )
            model = "unavailable"
    logger.info("Using model: %s", model)

    llm = LLMClient(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=model,
    )

    # --- Context window ------------------------------------------------------
    ctx = await discover_context_window(
        settings.llm_base_url, settings.llm_api_key, model
    )
    if ctx:
        settings.context_window = ctx
        logger.info("Discovered context window: %d tokens", ctx)
    else:
        logger.info("Using default context window: %d tokens", settings.context_window)

    # --- MCP tools (optional) ------------------------------------------------
    mcp_servers = load_mcp_servers(raw_config)
    mcp_manager = MCPManager()
    if mcp_servers:
        await mcp_manager.connect_all(mcp_servers)
        connected = mcp_manager.server_names
        failed = [n for n in mcp_servers if n not in connected]
        if connected:
            logger.info(
                "Connected to %d MCP server(s): %s",
                len(connected),
                ", ".join(connected),
            )
        if failed:
            logger.warning(
                "%d MCP server(s) unreachable: %s. "
                "The agent will start without them -- reconnect via the UI.",
                len(failed),
                ", ".join(failed),
            )
        if not connected:
            logger.warning("No MCP servers connected. Tools will be unavailable.")
    else:
        logger.info("No MCP servers configured in %s", config_path or "config.json")

    # --- Skills --------------------------------------------------------------
    skills = SkillsManager()
    skills.load(settings.skills_dir)
    logger.info("Loaded %d skill(s) from %s", len(skills.names), settings.skills_dir)

    # --- Playbooks -----------------------------------------------------------
    playbooks_manager = PlaybooksManager()
    playbooks_manager.load(settings.playbooks_dir)
    logger.info(
        "Loaded %d playbook(s) from %s",
        len(playbooks_manager.list_all()),
        settings.playbooks_dir,
    )

    # --- Registry ------------------------------------------------------------
    registry = ToolRegistry(mcp=mcp_manager, skills=skills)
    await registry.refresh()
    tool_count = len(registry.get_tool_definitions())
    logger.info("Tool registry ready (%d tool(s))", tool_count)

    # --- Memory ---------------------------------------------------------------
    memory = ChatMemory(
        max_turns=settings.memory_max_turns,
        ttl_seconds=settings.memory_ttl_seconds,
    )
    logger.info(
        "Chat memory ready (max_turns=%d, ttl=%ds)",
        settings.memory_max_turns,
        settings.memory_ttl_seconds,
    )

    # --- Chat store (disk persistence) ----------------------------------------
    chat_store = ChatStore(settings.cache_dir)
    logger.info("Chat store ready at %s", settings.cache_dir)

    yield

    # Shutdown
    await mcp_manager.disconnect_all()


api = FastAPI(title="Agent API")


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    skills: list[str] | None = None
    context: dict[str, str] | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str


class ApproveRequest(BaseModel):
    approved: bool
    reason: str | None = None


@api.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Non-streaming: returns the complete answer as JSON."""
    sid = request.session_id or uuid4().hex
    history = memory.load(sid)
    answer, turn_messages = await agent.run(
        request.message,
        registry,
        llm,
        history=history,
        initial_skills=request.skills,
        max_active_skills=settings.max_active_skills,
        context=request.context,
        max_iterations=settings.max_iterations,
        max_retries=settings.max_retries,
        retry_delay=settings.retry_delay,
        tool_result_limit=settings.memory_tool_result_limit,
    )
    memory.append(sid, turn_messages)
    chat_store.save_chat(sid, memory.load(sid))
    return ChatResponse(response=answer, session_id=sid)


@api.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    approve: bool = Query(default=False),
):
    """Streaming: emits SSE events as the agent works.

    With ?approve=true the stream pauses before each tool execution
    and waits for a POST to /chat/{session_id}/approve.
    """
    sid = request.session_id or uuid4().hex
    history = memory.load(sid)

    approval_queue: asyncio.Queue[tuple[bool, str | None]] | None = None
    if approve:
        approval_queue = asyncio.Queue()
        _approval_queues[sid] = approval_queue

    async def approve_fn(name: str, arguments: dict) -> tuple[bool, str | None]:
        assert approval_queue is not None
        return await approval_queue.get()

    async def event_generator():
        turn_messages: list[dict] = []
        last_checkpoint: list[dict] | None = None
        try:
            yield {
                "event": "session",
                "data": json.dumps({"session_id": sid}),
            }

            stream = agent.run_stream(
                request.message,
                registry,
                llm,
                context_window=settings.context_window,
                approve_fn=approve_fn if approve else None,
                history=history,
                initial_skills=request.skills,
                max_active_skills=settings.max_active_skills,
                context=request.context,
                max_iterations=settings.max_iterations,
                max_retries=settings.max_retries,
                retry_delay=settings.retry_delay,
                tool_result_limit=settings.memory_tool_result_limit,
            )
            async for event in stream:
                if event["event"] == "checkpoint":
                    last_checkpoint = event["messages"]
                    chat_store.save_chat(sid, history + last_checkpoint)
                    continue
                if event["event"] == "done":
                    turn_messages = event.get("messages", [])
                sse_event = {k: v for k, v in event.items() if k != "messages"}
                yield {"event": sse_event["event"], "data": json.dumps(sse_event)}

            memory.append(sid, turn_messages)
            chat_store.save_chat(sid, memory.load(sid))
        finally:
            _approval_queues.pop(sid, None)
            if not turn_messages and last_checkpoint:
                last_checkpoint.append(
                    {"role": "assistant", "content": "", "cancelled": True}
                )
                memory.append(sid, last_checkpoint)
                chat_store.save_chat(sid, memory.load(sid))

    return EventSourceResponse(event_generator())


@api.post("/chat/{session_id}/approve")
async def approve_tool(session_id: str, request: ApproveRequest):
    """Push an approval decision for a pending tool call."""
    queue = _approval_queues.get(session_id)
    if not queue:
        return {"error": "unknown session"}
    await queue.put((request.approved, request.reason))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Chat history (persistent)
# ---------------------------------------------------------------------------


@api.get("/chats")
async def list_chats():
    """List all saved chats (id, title, updated_at), newest first."""
    return {"chats": chat_store.list_chats()}


@api.get("/chats/{chat_id}")
async def get_chat(chat_id: str):
    """Load a saved chat with full messages."""
    record = chat_store.load_chat(chat_id)
    if record is None:
        return {"error": "chat not found"}
    return record


@api.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str):
    """Delete a saved chat."""
    deleted = chat_store.delete_chat(chat_id)
    if not deleted:
        return {"error": "chat not found"}
    return {"ok": True}


class RenameChatRequest(BaseModel):
    title: str


@api.put("/chats/{chat_id}/title")
async def rename_chat(chat_id: str, request: RenameChatRequest):
    """Rename a saved chat."""
    record = chat_store.rename_chat(chat_id, request.title)
    if record is None:
        return {"error": "chat not found"}
    return {
        "id": record["id"],
        "title": record["title"],
        "updated_at": record["updated_at"],
    }


# ---------------------------------------------------------------------------
# Introspection & control
# ---------------------------------------------------------------------------


@api.get("/tools")
async def list_tools():
    """List available tools with name, short description, and parameter schema."""
    tools = registry.get_tool_definitions()
    return {
        "tools": [
            {
                "name": t["function"]["name"],
                "description": first_sentence(t["function"].get("description", "")),
                "parameters": t["function"].get("parameters", {}),
            }
            for t in tools
        ]
    }


class ToolCallRequest(BaseModel):
    arguments: dict = {}


class ToolCallResponse(BaseModel):
    tool: str
    result: str


@api.post("/tools/{tool_name}", response_model=ToolCallResponse)
async def call_tool(tool_name: str, request: ToolCallRequest):
    """Execute a registered tool directly, bypassing the LLM agent loop."""
    known = {t["function"]["name"] for t in registry.get_tool_definitions()}
    if tool_name not in known:
        return ToolCallResponse(tool=tool_name, result=f"Unknown tool: {tool_name}")
    result = await registry.execute_tool(tool_name, request.arguments)
    return ToolCallResponse(tool=tool_name, result=result)


@api.get("/skills")
async def list_skills():
    """List available skills."""
    return {"skills": registry.skills.list_all()}


@api.get("/playbooks")
async def list_playbooks():
    """List available playbooks with metadata and body."""
    return {"playbooks": playbooks_manager.list_all()}


@api.get("/status")
async def status():
    """Return current server configuration at a glance."""
    llm_ok = True
    try:
        await llm.list_models()
    except Exception:
        llm_ok = False
    return {
        "model": llm.model,
        "llm_status": "ok" if llm_ok else "unreachable",
        "mcp_servers": mcp_manager.server_names,
        "tools": len(registry.get_tool_definitions()),
        "context_window": settings.context_window,
        "max_active_skills": settings.max_active_skills,
    }


@api.get("/models")
async def list_models():
    """List models available on the LLM server."""
    try:
        return {"models": await llm.list_models()}
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Cannot reach LLM server: {exc}. Is it running?",
        ) from exc


class ModelRequest(BaseModel):
    model: str


@api.put("/model")
async def switch_model(request: ModelRequest):
    """Hot-swap the active LLM model."""
    global llm

    llm = LLMClient(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=request.model,
    )

    ctx = await discover_context_window(
        settings.llm_base_url, settings.llm_api_key, request.model
    )
    if ctx:
        settings.context_window = ctx

    logger.info(
        "Switched to model: %s (ctx=%d)", request.model, settings.context_window
    )
    return {"model": request.model, "context_window": settings.context_window}


# ---------------------------------------------------------------------------
# MCP server management
# ---------------------------------------------------------------------------


@api.get("/mcp")
async def list_mcp():
    """List all configured MCP servers with their connection status."""
    return {"servers": mcp_manager.get_server_info()}


@api.post("/mcp/{name}")
async def connect_mcp(name: str):
    """Connect a configured MCP server by name."""
    try:
        ok = await mcp_manager.connect_one(name)
    except Exception as exc:
        logger.warning("Failed to connect MCP server %s: %s", name, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Cannot reach MCP server '{name}': {exc}",
        ) from exc
    if not ok:
        return {"error": f"unknown server: {name}"}
    await registry.refresh()
    logger.info("MCP server connected: %s", name)
    return {
        "servers": mcp_manager.get_server_info(),
        "tools": len(registry.get_tool_definitions()),
    }


@api.delete("/mcp/{name}")
async def disconnect_mcp(name: str):
    """Disconnect an MCP server by name."""
    removed = await mcp_manager.disconnect_one(name)
    if not removed:
        return {"error": f"unknown server: {name}"}
    await registry.refresh()
    logger.info("MCP server disconnected: %s", name)
    return {
        "servers": mcp_manager.get_server_info(),
        "tools": len(registry.get_tool_definitions()),
    }


# ---------------------------------------------------------------------------
# Root application -- mounts API at /api and serves web/dist when available
# ---------------------------------------------------------------------------

_pkg_dir = Path(__file__).resolve().parent
_web_dist = _pkg_dir / "web_dist"
if not _web_dist.is_dir():
    _web_dist = _pkg_dir.parent / "web" / "dist"

app = FastAPI(title="Agent", lifespan=lifespan)
app.mount("/api", api)

_no_web = os.environ.get("NO_WEB", "").lower() in ("1", "true", "yes")

if not _no_web and _web_dist.is_dir():
    logger.info("Serving web UI from %s", _web_dist)

    @app.get("/{full_path:path}")
    async def _spa_fallback(full_path: str):
        file_path = (_web_dist / full_path).resolve()
        if (
            full_path
            and file_path.is_file()
            and str(file_path).startswith(str(_web_dist))
        ):
            return FileResponse(file_path)
        return FileResponse(_web_dist / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "mtv_agent.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=True,
    )
