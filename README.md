# MultiPDFChat

Persistent multi-document RAG (Retrieval-Augmented Generation) with streaming AI responses, source-grounded retrieval, live PDF preview, and intelligent document interaction.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge)

---

## Architecture
User Query → Query Routing → Vector Retrieval (FAISS)
→ Similarity Filtering → Keyword Reranking
→ Context Construction → LLM Generation (Ollama/Gemini)
→ Streaming Response → Source Grounding + PDF Preview
plain

---

## Features

- **Multi-PDF Document Chat** — Upload and chat with multiple PDFs simultaneously
- **Persistent Vector Storage** — FAISS with automatic chunking and indexing
- **Intelligent Retrieval Pipeline** — Semantic search + similarity filtering + lightweight reranking + dynamic retrieval depth
- **Streaming AI Responses** — Real-time token streaming for smooth UX
- **Source-Grounded Answers** — Clickable citations with page references and passage previews
- **Live PDF Preview** — Jump directly to referenced pages from source cards
- **Dual AI Architecture** — Ollama (local/offline) and Gemini (cloud) support
- **Normal Chat Fallback** — Graceful degradation when no documents are uploaded
- **Health Check Endpoint** — Monitor backend, Ollama, and vector store status

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI, LangChain, PyPDF |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` |
| Vector DB | FAISS (persistent) |
| LLM | Ollama (Phi3) / Google Gemini |

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com/) installed and running

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start server
python -m uvicorn api:app --reload --host 0.0.0.0 --port 8000
Frontend
bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
Environment
bash
cp .env.example .env
# Add your GOOGLE_API_KEY (optional — Ollama works fully offline)
Project Structure
plain
backend/
  api.py           # FastAPI endpoints (upload, chat, reset, health)
  utils.py         # PDF loading, chunking, vector store, LLM routing
  requirements.txt # Python dependencies

frontend/
  src/
    App.tsx        # Main chat interface
  index.html
  package.json
  vite.config.ts

.env.example       # Environment variable template
Key Engineering Decisions
Dynamic retrieval depth — Short queries retrieve 2 chunks, medium 4, long 6
Keyword reranking — Boosts chunks with query term overlap for better relevance
Strict context adherence — Prompt explicitly forbids hallucination; answers must come from retrieved context
Stateless backend — No shared chat history between users; clean per-request architecture
Source deduplication — Multiple chunks from the same page are merged into a single citation card
API Endpoints
Table
Endpoint	Method	Description
/upload	POST	Upload a PDF, extract text, chunk and index
/chat	POST	Stream AI response with source grounding
/reset	POST	Clear all documents and vector store
/health	GET	Check backend, Ollama, and vector store status
Future Roadmap
[ ] Multi-session chat memory
[ ] Hybrid BM25 + semantic search
[ ] Cross-encoder reranking
[ ] Docker deployment
[ ] OCR for scanned PDFs
