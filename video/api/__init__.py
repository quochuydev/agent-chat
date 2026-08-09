"""FastAPI connector that wraps the local video/ scripts as an async job API.

See docs/architecture/ — this is the "Connector + Jobs" layer (docs 02, 03, 06, 07).
The agent (web/src/app/api/chat/route.ts) is the only thing that talks to the LLM;
everything in this package is plain backend: accept a job, run a script, track progress.
"""
