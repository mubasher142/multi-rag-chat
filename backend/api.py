from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from langchain_ollama import OllamaLLM 
from pypdf import PdfReader
from langchain_core.documents import Document
import shutil
import os
import json

# Global state
uploaded_docs_count = 0
all_documents = []
vector_store = None

from utils import (
    get_pdf_documents,
    get_text_chunks,
    get_vector_store,
    client,  # Gemini client
)

# -----------------------------
# App init
# -----------------------------
app = FastAPI()
os.makedirs("data", exist_ok=True)
app.mount("/pdfs", StaticFiles(directory="data"), name="pdfs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Upload endpoint
# -----------------------------

@app.post("/upload")
def upload_pdf(file: UploadFile = File(...)):
    global vector_store, uploaded_docs_count, all_documents

    # Validate filename
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    os.makedirs("data", exist_ok=True)
    file_path = os.path.join("data", file.filename)

    # Ensure stream is at beginning, then save
    try:
        file.file.seek(0)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Validate file actually has content
    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Validate it's a readable PDF
    try:
        pdf_reader = PdfReader(file_path)
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"Invalid or corrupted PDF: {str(e)}")

    documents = []
    for i, page in enumerate(pdf_reader.pages):
        text = page.extract_text()
        if text:
            documents.append(
                Document(
                    page_content=text,
                    metadata={
                        "source": file.filename,
                        "page": i + 1,
                        "section_hint": text[:80].lower()
                    }
                )
            )

    print(f"Documents created: {len(documents)}")

    chunks = get_text_chunks(documents)
    all_documents.extend(documents)
    print(f"Chunks created: {len(chunks)}")

    if len(chunks) == 0:
        return {
            "filename": file.filename,
            "chunks": 0,
            "warning": "No text could be extracted. The PDF may be scanned/images-only."
        }

    if vector_store is None:
        vector_store = get_vector_store(chunks)
    else:
        vector_store.add_documents(chunks)

    uploaded_docs_count += len(chunks)

    return {
        "filename": file.filename,
        "chunks": len(chunks),
        "message": "Vector store updated successfully"
    }

# -----------------------------
# Load RAG system ONCE
# -----------------------------
print("Loading vector store...")

if os.path.exists("data"):
    documents = get_pdf_documents("data")
else:
    documents = []
    print("No data folder found, starting with empty vector store.")

chunks = get_text_chunks(documents)
vector_store = get_vector_store(chunks)

print("System ready!")

# -----------------------------
# Request schema
# -----------------------------
class Query(BaseModel):
    question: str
    model: str  # "ollama" or "gemini"

# -----------------------------
# Chat endpoint
# -----------------------------
@app.post("/chat")
def chat(query: Query):
    global vector_store

    def generate():
        has_docs = (
            vector_store is not None
            and len(vector_store.index_to_docstore_id) > 0
        )

        if not has_docs:
            # Normal chat — NO sources yielded
            llm = OllamaLLM(model="phi3", temperature=0)
            normal_prompt = f"""You are a helpful AI assistant.
        Answer the question normally and clearly.
        Question: {query.question}
        Answer:"""
            for chunk in llm.stream(normal_prompt):
                yield str(chunk).encode("utf-8")
            return
        # Dynamic retrieval depth
        word_count = len(query.question.split())
        if word_count <= 4:
            retrieval_k = 2
        elif word_count <= 10:
            retrieval_k = 4
        else:
            retrieval_k = 6

        docs_with_scores = vector_store.similarity_search_with_score(
            query.question,
            k=retrieval_k
        )

        if retrieval_k <= 2:
            docs = [doc[0] for doc in docs_with_scores[:1]]
        elif retrieval_k <= 4:
            docs = [doc[0] for doc in docs_with_scores[:2]]
        else:
            docs = [doc[0] for doc in docs_with_scores[:3]]

        # Keyword reranking
        query_words = set(query.question.lower().split())
        reranked_docs = []

        for doc in docs:
            content_words = set(doc.page_content.lower().split())
            overlap = len(query_words.intersection(content_words))
            length_score = min(len(doc.page_content) / 500, 1)
            rerank_score = overlap + length_score
            reranked_docs.append((doc, rerank_score))

        reranked_docs.sort(key=lambda x: x[1], reverse=True)
        filtered_docs = [doc[0] for doc in reranked_docs[:2]]

        if filtered_docs:
            docs = filtered_docs

        sources = [
            {
                "fileName": doc.metadata["source"],
                "pageNumber": doc.metadata["page"],
                "preview": doc.page_content[:300]
            }
            for doc in docs
        ]
        seen = set()
        unique_sources = []
        for src in sources:
            key = (src["fileName"], src["pageNumber"])
            if key not in seen:
                seen.add(key)
                unique_sources.append(src)
        sources = unique_sources

        context = "\n\n".join([doc.page_content[:400] for doc in docs])


        print("------ CONTEXT ------")
        print(context[:400])
        print("---------------------")

        prompt = f"""You are a strict document-based assistant.

You MUST answer ONLY from the given context.
DO NOT use outside knowledge.
DO NOT include extra details.
DO NOT guess.

If the answer is NOT present in the context, reply EXACTLY:
"Answer not found in the document."

Context:
{context}

Question:
{query.question}

Answer:
"""

        # Route to correct model
        if query.model == "gemini":
            print("📄 RAG MODE (Gemini)")
            try:
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt
                )
                if hasattr(response, "text") and response.text:
                    answer = response.text
                else:
                    try:
                        answer = response.candidates[0].content.parts[0].text
                    except:
                        answer = "Sorry, I couldn't generate a response."
            except Exception as e:
                print(f"Gemini error: {e}")
                answer = f"Error calling Gemini: {str(e)}"

            # Yield in chunks so frontend streaming works consistently
            for i in range(0, len(answer), 5):
                yield answer[i:i+5].encode("utf-8")

        else:
            print("📄 RAG MODE (Ollama)")
            llm = OllamaLLM(model="phi3", temperature=0)
            for chunk in llm.stream(prompt):
                yield str(chunk).encode("utf-8")

        yield "\n\n[SOURCES]\n" + json.dumps(sources)

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")

# -----------------------------
# Reset endpoint
# -----------------------------
@app.post("/reset")
def reset_vector_store():
    global vector_store, uploaded_docs_count, all_documents

    vectorstore_path = "vectorstore"

    vector_store = None
    uploaded_docs_count = 0
    all_documents = []

    if os.path.exists(vectorstore_path):
        shutil.rmtree(vectorstore_path)
        print("Persistent vector store deleted ✅")

    return {"message": "Vector store fully reset"}

import requests

@app.get("/health")
def health_check():
    # Check Ollama
    ollama_status = "disconnected"
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=2)
        if response.status_code == 200:
            ollama_status = "connected"
    except:
        pass

    return {
        "status": "ok",
        "ollama": ollama_status,
        "vector_store_active": vector_store is not None,
        "documents_indexed": len(all_documents),
        "chunks_indexed": uploaded_docs_count
    }