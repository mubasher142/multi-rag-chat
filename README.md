# 🚀 Multi-RAG-Chat

Persistent multi-document RAG (Retrieval-Augmented Generation) application with streaming AI responses, source-grounded retrieval, live PDF preview, reranking, and intelligent document interaction using FastAPI, React, Ollama, and LangChain.

---

## ✨ Features

### 📄 Multi-PDF Document Chat

* Upload and chat with multiple PDFs simultaneously
* Persistent vector storage using FAISS
* Automatic document chunking and indexing

### 🧠 Intelligent Retrieval Pipeline

* Semantic vector search
* Similarity score filtering
* Lightweight reranking
* Dynamic retrieval depth
* Keyword-aware retrieval boosting

### 💬 Streaming AI Responses

* Real-time streaming answers
* Smooth conversational experience
* Normal chat fallback mode

### 🔍 Source-Grounded Answers

* Source citations with page references
* Clickable source cards
* Relevant passage previews
* Evidence-based retrieval

### 📑 Live PDF Preview

* Open PDF directly from source references
* Automatic page navigation
* In-app document preview experience

### 💾 Persistent Vector Database

* FAISS vector persistence
* Backend restart recovery
* Proper vector lifecycle management
* Reset/delete support

### ⚡ Hybrid AI Architecture

* Ollama local inference support
* Gemini integration support
* Multi-model architecture ready
* Future LangGraph orchestration ready

---

# 🏗️ System Architecture

```text
User Query
    ↓
Query Routing
    ↓
Vector Retrieval (FAISS)
    ↓
Similarity Filtering
    ↓
Keyword Reranking
    ↓
Context Construction
    ↓
LLM Generation (Ollama/Gemini)
    ↓
Streaming Response
    ↓
Source Grounding + PDF Preview
```

---

# 🛠️ Tech Stack

## Frontend

* React
* TypeScript
* TailwindCSS
* Vite

## Backend

* FastAPI
* LangChain
* FAISS
* Ollama
* Gemini API
* PyPDF

## AI / Retrieval

* Retrieval-Augmented Generation (RAG)
* Semantic Search
* Lightweight Reranking
* Dynamic Retrieval Depth
* Persistent Vector Embeddings

---

# 📸 Screenshots

## Chat Interface

![Chat UI](./screenshots/Screenshot%202026-05-12%20111922.png)

## PDF Source Preview

![PDF Preview](./screenshots/Screenshot%202026-05-12%20112313.png)

## Source Grounding

![Sources](./screenshots/Screenshot%202026-05-12%20112348.png)

---

# ⚙️ Installation

## 1️⃣ Clone Repository

```bash
git clone https://github.com/mubasher142/multi-rag-chat.git
cd multi-rag-chat
```

---

## 2️⃣ Backend Setup

```bash
cd backend

python -m venv venv

# Windows
venv\Scripts\activate

pip install -r requirements.txt
```

Run backend:

```bash
uvicorn api:app --reload
```

---

## 3️⃣ Frontend Setup

```bash
cd frontend

npm install
npm run dev
```

---

# 🚀 Usage

## Upload PDFs

* Upload one or multiple PDF documents
* Documents are automatically chunked and indexed

## Ask Questions

* Query uploaded documents naturally
* Receive grounded AI responses with citations

## View Sources

* Click source cards
* Open live PDF preview
* Jump directly to referenced page

---

# 🧠 Retrieval Engineering Improvements

This project includes several advanced RAG optimizations:

* Similarity score filtering
* Lightweight reranking
* Dynamic top-k retrieval
* Keyword overlap boosting
* Source-grounded answer generation
* Context relevance filtering

---

# 📂 Project Structure

```text
multi-rag-chat/
│
├── frontend/
│   ├── src/
│   └── ...
│
├── backend/
│   ├── api.py
│   ├── utils.py
│   ├── vectorstore/
│   └── data/
│
├── screenshots/
│
├── README.md
└── .gitignore
```

---

# 🔮 Future Improvements

* LangGraph workflow orchestration
* OCR support for scanned PDFs
* Hybrid BM25 retrieval
* Multi-session chat memory
* Advanced reranking models
* Web search augmentation
* Authentication system
* Cloud deployment
* PDF text highlighting
* Agentic workflows

---

# 🎯 Project Goals

This project explores:

* Retrieval-Augmented Generation (RAG)
* Document intelligence systems
* Persistent vector databases
* AI retrieval engineering
* Source-grounded AI responses
* Interactive AI document workflows

---

---

# 🙌 Acknowledgements

Built using:

* LangChain
* FastAPI
* React
* Ollama
* FAISS
* TailwindCSS
* Gemini API
