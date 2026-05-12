from fastapi.staticfiles import StaticFiles
from multiprocessing import context
from fastapi import FastAPI
from ollama import generate
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse
from langchain_ollama import OllamaLLM 
from pypdf import PdfReader
from langchain_core.documents import Document
import shutil
import os
import json


# import io

uploaded_docs_count = 0
all_documents = []

from utils import (
    get_pdf_documents,
    get_text_chunks,
    get_vector_store,
    chat_with_pdf,
    chat_with_gemini
)

# -----------------------------
# App init
# -----------------------------
app = FastAPI()

app.mount("/pdfs", StaticFiles(directory="data"), name="pdfs")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload")
def upload_pdf(file: UploadFile = File(...)):
    global vector_store, uploaded_docs_count

    # pdf_reader = PdfReader(file.file)
    # 🔥 Save uploaded PDF physically
# 🔥 Save uploaded PDF physically
    os.makedirs("data", exist_ok=True)

    file_path = os.path.join("data", file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 🔥 Read saved PDF
    pdf_reader = PdfReader(file_path)

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
            "error": "No text extracted from PDF"
        }


    # 🔥 ALWAYS rebuild vector store from uploaded PDFs
    # vector_store = get_vector_store(chunks)
    if vector_store is None:
        vector_store = get_vector_store(chunks)
    else:
        # If vector store already exists, add new chunks to it
        vector_store.add_documents(chunks)

    uploaded_docs_count += len(chunks)


    return {
        "filename": file.filename,
        "chunks": len(chunks),
        "message": "Vector store replaced successfully"
    }

# -----------------------------
# Load RAG system ONCE
# -----------------------------
print("Loading vector store...")

documents = get_pdf_documents("data")
chunks = get_text_chunks(documents)
vector_store = get_vector_store(chunks)

print("System ready!")

# -----------------------------
# Memory
# -----------------------------
chat_history = []

# -----------------------------
# Request schema
# -----------------------------
class Query(BaseModel):
    question: str
    model: str  # "ollama" or "gemini"

# -----------------------------
# API endpoint
# -----------------------------

@app.post("/chat")
def chat(query: Query):
    global vector_store, chat_history
    def generate():

        question = query.question.lower()

        # 🔥 Simple query detection
        simple_keywords = [
            "hi", "hello", "hey",
            "what is", "who is",
            "define", "meaning",
            "explain briefly"
        ]

        is_simple = any(word in question for word in simple_keywords)

        # has_docs = vector_store is not None and len(vector_store.index_to_docstore_id) > 0 and query.question.strip() != ""
        # has_docs = uploaded_docs_count > 0
        has_docs = (
            vector_store is not None
            and len(vector_store.index_to_docstore_id) > 0
        )

        # 🔍 If no documents → normal chat
        if not has_docs:
            print("No documents → normal chat mode")

            llm = OllamaLLM(model="phi3", temperature=0)

            normal_prompt = f"""
        You are a helpful AI assistant.

        Answer the question normally and clearly.

        Question:
        {query.question}

        Answer:
        """

            full_answer = ""

            for chunk in llm.stream(normal_prompt):
                text_chunk = str(chunk)
                full_answer += text_chunk
                yield text_chunk.encode("utf-8")

            chat_history.append((query.question, full_answer))
            return

        # 🔍 Retrieve context
        docs_with_scores = vector_store.similarity_search_with_score(
            query.question,
            k=4
        )

        # lower score = more relevant
        # 🔥 Dynamic retrieval depth

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

        # keep best 2 chunks
        # 🔥 Keep only best chunks dynamically

        if retrieval_k <= 2:
            docs = [doc[0] for doc in docs_with_scores[:1]]

        elif retrieval_k <= 4:
            docs = [doc[0] for doc in docs_with_scores[:2]]

        else:
            docs = [doc[0] for doc in docs_with_scores[:3]]

        filtered_docs = []

        query_words = set(query.question.lower().split())

        reranked_docs = []

        for doc in docs:

            content_words = set(doc.page_content.lower().split())

            # keyword overlap score
            overlap = len(query_words.intersection(content_words))

            # chunk length bonus
            length_score = min(len(doc.page_content) / 500, 1)

            # total rerank score
            rerank_score = overlap + length_score

            reranked_docs.append((doc, rerank_score))

        # 🔥 Sort by rerank score descending
        reranked_docs = sorted(
            reranked_docs,
            key=lambda x: x[1],
            reverse=True
        )

        # keep best reranked chunks
        filtered_docs = [doc[0] for doc in reranked_docs[:2]]

        # fallback if nothing matched
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
        

        context = "\n\n".join([doc.page_content[:400] for doc in docs])

        print("------ CONTEXT ------")
        print(context[:400])
        print("---------------------")

        # 🔥 Strict prompt
        prompt = f"""
You are a strict document-based assistant.

You MUST answer ONLY from the given context.
DO NOT use outside knowledge.
DO NOT include extra details.
DO NOT summarize unrelated parts.
DO NOT guess.

If the answer is NOT present in the context, reply EXACTLY:
"Answer not found in the document."

Context:
{context}

Question:
{query.question}

Answer:
"""

        full_answer = ""

        # 🔥 ALWAYS use RAG when docs exist
# 🔥 ALWAYS use RAG when docs exist
        print("📄 RAG MODE (Ollama)")

        llm = OllamaLLM(model="phi3", temperature=0)

        for chunk in llm.stream(prompt):
            text_chunk = str(chunk)
            full_answer += text_chunk
            yield text_chunk.encode("utf-8")

        # ✅ Save memory
        chat_history.append((query.question, full_answer))

# 🔥 Send sources at end of stream
        import json

        yield "\n\n[SOURCES]\n" + json.dumps(sources)

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")

@app.post("/reset")
def reset_vector_store():

    global vector_store

    vectorstore_path = "vectorstore"

    # 🔥 clear RAM memory
    vector_store = None

    # 🔥 delete saved FAISS files
    if os.path.exists(vectorstore_path):
        shutil.rmtree(vectorstore_path)

        print("Persistent vector store deleted ✅")

    return {
        "message": "Vector store fully reset"
    }