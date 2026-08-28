import os
from google import genai

# Safe client initialization
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("WARNING: GOOGLE_API_KEY not set. Gemini mode will fail.")
client = genai.Client(api_key=api_key)

from pypdf import PdfReader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaLLM

# Load embedding model ONCE
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# Load LLM ONCE
ollama_llm = OllamaLLM(model="phi3", temperature=0, num_predict=1024)

# -----------------------------
# 1. Load PDFs
# -----------------------------
def get_pdf_documents(folder_path):
    documents = []
    for file in os.listdir(folder_path):
        if file.endswith(".pdf"):
            pdf_path = os.path.join(folder_path, file)
            pdf_reader = PdfReader(pdf_path)
            for i, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                if page_text:
                    documents.append(
                        Document(
                            page_content=page_text,
                            metadata={"source": file, "page": i + 1}
                        )
                    )
    return documents

# -----------------------------
# 2. Chunk documents
# -----------------------------
def get_text_chunks(documents):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=400,
        chunk_overlap=50,
        separators=["\n\n", "\n", ".", " "]
    )
    return text_splitter.split_documents(documents)

# -----------------------------
# 3. Vector store (FIXED)
# -----------------------------
def get_vector_store(chunks, save_path="vectorstore"):
    faiss_file = os.path.join(save_path, "index.faiss")

    # If exists → LOAD
    if os.path.exists(faiss_file):
        print("Loading existing vector store...")
        vector_store = FAISS.load_local(
            save_path,
            embeddings,
            allow_dangerous_deserialization=True
        )
        if chunks:
            vector_store.add_documents(chunks)
            vector_store.save_local(save_path)
        return vector_store

    # No chunks + no existing store = return None
    if not chunks:
        print("No existing store and no chunks provided.")
        return None

    # Create new
    print("Creating new vector store...")
    vector_store = FAISS.from_documents(chunks, embedding=embeddings)
    os.makedirs(save_path, exist_ok=True)
    vector_store.save_local(save_path)
    return vector_store