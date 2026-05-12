import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Send, 
  Plus, 
  Trash2, 
  Loader2, 
  MessageSquare, 
  Zap,
  FileCheck,
  X,
  Menu
} from 'lucide-react';
import { cn } from './lib/utils';
import { extractTextFromPdf } from './lib/pdf-processor';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  sources?: {
  fileName: string;
  pageNumber: number;
  preview?: string;
}[];
}

interface UploadedFile {
  name: string;
  status: 'processing' | 'ready' | 'error';
  chunkCount?: number;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [processedChunkCount, setProcessedChunkCount] = useState(0);
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'ollama'>('gemini');
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [showResyncWarning, setShowResyncWarning] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const isLoadedRef = useRef(false);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('mpc_messages');
    const savedFiles = localStorage.getItem('mpc_uploaded_files');
    const savedVectors = localStorage.getItem('mpc_vector_store');

    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error('Failed to load messages', e);
      }
    }

    if (savedFiles) {
      try {
        const files = JSON.parse(savedFiles);
        setUploadedFiles(files);
        setProcessedChunkCount(files.reduce((acc: number, f: any) => acc + (f.chunkCount || 0), 0));
        // Note: In this architecture, vectors are on the server.
        // If the server restarts, documents would need re-uploading unless persisted in a real DB.
      } catch (e) {
        console.error('Failed to load file metadata', e);
      }
    }
    
    isLoadedRef.current = true;
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!isLoadedRef.current) return;
    localStorage.setItem('mpc_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    localStorage.setItem('mpc_uploaded_files', JSON.stringify(uploadedFiles));
  }, [uploadedFiles, processedChunkCount]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  // const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const files = event.target.files;
  //   if (!files || files.length === 0) return;
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const file = files[0];

  try {
    // Step 1: show processing state in UI
    const tempFile: UploadedFile = {
      name: file.name,
      status: 'processing',
      chunkCount: 0
    };
    setUploadedFiles(prev => [...prev, tempFile]);

    // Step 2: send to backend
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("http://localhost:8000/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    console.log("Upload response:", data);

    // Step 3: update UI with REAL data
    const uploadingIndex = uploadedFiles.length;
    setUploadedFiles(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          status: 'ready',
          chunkCount: data.chunks
        };
      }
      return updated;
    }
    );

    // Step 4: update total vectors
    setProcessedChunkCount(prev => prev + data.chunks);

  } catch (error) {
    console.error("Upload failed:", error);

    // mark error in UI
    
    setUploadedFiles(prev =>
      prev.map(f =>
        f.name === file.name
          ? { ...f, status: 'error' }
          : f
      )
    );
  }

  if (fileInputRef.current) fileInputRef.current.value = '';
};

    // NOTE: This now assumes your FastAPI backend handles ingestion.
    // In a production setup, you would have a POST /upload endpoint here.
    // For now, we'll mark them as ready so the UI allows chatting.
  //   const newFiles: UploadedFile[] = Array.from(files).map(f => ({ 
  //     name: f.name, 
  //     status: 'ready',
  //     chunkCount: 0 
  //   }));
  //   setUploadedFiles(prev => [...prev, ...newFiles]);
    
  //   if (fileInputRef.current) fileInputRef.current.value = '';
  // };
console.log("SELECTED MODEL:", selectedModel);

// const modelToSend = selectedModel.includes("Ollama") ? "ollama" : "gemini";

// console.log("MODEL SENT TO BACKEND:", modelToSend);

const handleSendMessage = async (e?: React.FormEvent) => {
  e?.preventDefault();
  if (!input.trim() || isGenerating) return;

  const userMessage: Message = {
    id: Date.now().toString(),
    role: 'user',
    text: input.trim()
  };

  setMessages(prev => [...prev, userMessage]);
  setInput('');
  setIsGenerating(true);



  try {
    const response = await fetch('http://localhost:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: userMessage.text,
        model: selectedModel
        // .includes("Ollama") ? "ollama" : "gemini"
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`API error: ${response.status}`);
    }

    // 🔥 Create empty assistant message first
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: ""
    };

    setMessages(prev => [...prev, assistantMessage]);

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let fullText = "";

    // 🔥 STREAM LOOP
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullText += chunk;

      // 🔥 Update message live
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessage.id
            ? { ...msg, text: fullText }
            : msg
        )
      );
    }
      const parts = fullText.split("[SOURCES]");

      const cleanText = parts[0]?.trim() || "";
      const parsedSources = parts[1]
        ? JSON.parse(parts[1])
        : [];

          setMessages(prev =>
    prev.map(msg =>
      msg.id === assistantMessage.id
        ? {
            ...msg,
            text: cleanText,
            sources: parsedSources
          }
        : msg
    )
  );


} catch (error) {
  console.error('Chat API error:', error);

  setMessages(prev => {
    // 🔥 Try to find empty assistant message (created for streaming)
    const hasEmpty = prev.some(msg => msg.role === 'model' && msg.text === "");

    if (hasEmpty) {
      // ✅ Update existing empty message
      return prev.map(msg =>
        msg.role === 'model' && msg.text === ""
          ? {
              ...msg,
              text: "Error: Model failed (Gemini quota exceeded or backend issue). Try switching to Ollama."
            }
          : msg
      );
    }

    // ✅ Otherwise add new message (fallback)
    return [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Error: Model failed (Gemini quota exceeded or backend issue). Try switching to Ollama."
      }
    ];
  });
} finally {
    setIsGenerating(false);
  }
};

  const clearDocs = async () => {
    // clear frontend
    setUploadedFiles([]);
    setProcessedChunkCount(0);
    setMessages([]);

    localStorage.removeItem('mpc_messages');
    localStorage.removeItem('mpc_uploaded_files');
    localStorage.removeItem('mpc_vector_store');

    setShowResyncWarning(false);
    await fetch("http://localhost:8000/reset", {
      method: "POST"
    });
    setShowResyncWarning(true);
  };
  // const setPreviewPdf = setPreviewPdfState;

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-slate-300 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="h-16 border-b border-white/5 flex items-center justify-between px-4 sm:px-6 bg-[#0f0f12] shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            className="lg:hidden cursor-pointer p-2 hover:bg-white/5 rounded-lg text-slate-400"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.3)]">
            <Zap className="w-4 h-4 text-white fill-current" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-white">MultiPDF<span className="text-indigo-400">Chat</span></h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-6 text-sm">
          <div className="hidden sm:flex items-center gap-2 text-slate-400">
            <span className={cn(
              "w-2 h-2 rounded-full",
              processedChunkCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-600"
            )}></span>
             {processedChunkCount > 0 ? "Vector Engine Active" : "Engine Idle"}
          </div>
          <div className="hidden sm:block h-4 w-px bg-white/10"></div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            // disabled={!input.trim() || isGenerating}
            className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-3 sm:px-4 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span className="hidden xs:inline">Upload PDF</span>
            <span className="xs:hidden">Add</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            multiple 
            accept=".pdf" 
            className="hidden" 
          />
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {showMobileSidebar && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowMobileSidebar(false)}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 lg:hidden cursor-pointer"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="fixed inset-y-0 left-0 w-72 bg-[#0d0d10] border-r border-white/10 z-50 flex flex-col lg:hidden"
              >
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <Zap className="w-4 h-4 text-indigo-400" />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Knowledge Base</h2>
                  </div>
                  <button 
                    onClick={() => setShowMobileSidebar(false)}
                    className="cursor-pointer p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition-all active:scale-90"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <SidebarContent 
                  uploadedFiles={uploadedFiles}
                  processedChunkCount={processedChunkCount}
                  showResyncWarning={showResyncWarning}
                  clearDocs={clearDocs}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-72 bg-[#0d0d10] border-r border-white/5 flex-col shrink-0">
          <div className="p-5 border-b border-white/5">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 font-sans">Knowledge Base</h2>
          </div>
          <SidebarContent 
            uploadedFiles={uploadedFiles}
            processedChunkCount={processedChunkCount}
            showResyncWarning={showResyncWarning}
            clearDocs={clearDocs}
          />
        </aside>

        {/* Main Content Area: Chat */}
        <main className="flex-1 flex flex-col bg-[#0a0a0c] relative">
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 scroll-smooth"
          >
            {messages.length === 0 ? (
              <>
                <div className="flex items-center gap-2 mb-4 bg-slate-900/50 p-1 rounded-xl w-fit">
                  <button 
                    onClick={() => setSelectedModel('gemini')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                      selectedModel === 'gemini' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
                    )}
                  >
                    Gemini (Cloud)
                  </button>
                  <button 
                    onClick={() => setSelectedModel('ollama')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-medium transition-all font-mono cursor-pointer",
                      selectedModel === 'ollama' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
                    )}
                  >
                    Ollama (Offline)
                  </button>
                </div>
                <div className="h-full flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-10">
                  <div className="relative">
                     <div className="absolute inset-0 bg-indigo-600/20 blur-3xl rounded-full"></div>
                     <div className="relative w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center text-indigo-500 border border-indigo-500/20 shadow-2xl">
                       <MessageSquare className="w-10 h-10" />
                     </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold text-white mb-3 tracking-tight font-sans">Intelligent RAG Assistant</h3>
                    <p className="text-slate-400 text-sm leading-relaxed font-sans">
                      Ask complex questions across multiple PDF documents using secure semantic search driven by Gemini.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="max-w-3xl mx-auto space-y-10 pb-40">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-3 sm:gap-5",
                      msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 sm:w-9 sm:h-9 rounded-xl shrink-0 flex items-center justify-center border transition-all duration-300 shadow-lg",
                      msg.role === 'user' ? "bg-slate-800 border-white/10" : "bg-indigo-600/20 border-indigo-500/30"
                    )}>
                      {msg.role === 'user' ? <div className="text-[10px] font-bold text-slate-400">ME</div> : <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />}
                    </div>
                    
                    <div className={cn(
                      "flex flex-col gap-3",
                      msg.role === 'user' ? "max-w-[85%] sm:max-w-[75%]" : "max-w-[90%] sm:max-w-[85%]"
                    )}>
                      <div className={cn(
                        "rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm leading-relaxed shadow-2xl",
                        msg.role === 'user' 
                          ? "bg-indigo-600 text-white rounded-tr-none" 
                          : "bg-white/5 border border-white/10 text-slate-300 rounded-tl-none"
                      )}>
                        {msg.role === 'model' && (
                          <div className="flex items-center gap-2 mb-3 sm:mb-4">
                            <span className="text-[9px] px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 font-bold uppercase tracking-widest font-sans">Source Analysis</span>
                          </div>
                        )}
                        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed font-sans">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                          {isGenerating &&
                            messages[messages.length - 1]?.id === msg.id && (
                              <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse rounded-sm" />
                            )}
                        </div>
                      </div>

                      {msg.sources && msg.sources.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.sources.map((src, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  setPreviewPdf(src.fileName);
                                  setPreviewPage(src.pageNumber);
                                }}
                                className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2 flex items-center gap-3 hover:bg-indigo-500/20 transition-all text-left"
                              >
                            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-indigo-400" />
                            </div>

                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-white truncate font-medium">
                                {src.fileName}
                              </span>

                              <span className="text-[10px] text-indigo-300">
                                Page {src.pageNumber}
                              </span>
                            </div>
                          </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            {previewPdf && (
  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">

    <div className="bg-zinc-900 w-[90%] h-[90%] rounded-2xl p-4 relative flex flex-col">

      <button
        onClick={() => setPreviewPdf(null)}
        className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg"
      >
        Close
      </button>

            <div className="mb-4 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-sm text-slate-300 overflow-y-auto max-h-32">
        <div className="text-xs uppercase tracking-wider text-indigo-300 mb-2 font-bold">
          Relevant Passage
        </div>

        {
          messages
            .flatMap(m => m.sources || [])
            .find(
              s =>
                s.fileName === previewPdf &&
                s.pageNumber === previewPage
            )?.preview
        }
      </div>

      <iframe
        src={`http://localhost:8000/pdfs/${previewPdf}#page=${previewPage}`}
        className="w-full h-full rounded-xl"
      />

    </div>

  </div>
)}
          </div>
          


          {/* Floating Input Bar */}
          <div className="p-4 sm:p-8 absolute bottom-0 left-0 right-0 max-w-3xl mx-auto w-full z-20">
            <div className="bg-[#0f0f12]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] focus-within:border-indigo-500/50 transition-all duration-300">
              <form 
                onSubmit={handleSendMessage}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                uploadedFiles.length > 0
                  ? "Ask about your documents..."
                  : "Ask anything or upload PDFs..."
              }
              disabled={isGenerating}
                  className="flex-1 px-4 sm:px-5 py-3 sm:py-3.5 bg-transparent border-none focus:outline-none text-sm text-white placeholder:text-slate-600 font-sans"
                />
                <div className="flex items-center gap-1 sm:gap-2 px-1 sm:px-2">
                  <button
                    type="submit"
                    // disabled={!input.trim() || isGenerating || uploadedFiles.length === 0}
                    disabled={!input.trim() || isGenerating}
                    className="cursor-pointer p-2 sm:p-2.5 bg-indigo-600 text-white rounded-xl disabled:opacity-20 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                  >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </form>
            </div>
            <p className="mt-4 text-center text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] font-sans">
              Powered by Gemini 3 Flash • Secure RAG Engine
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ 
  uploadedFiles, 
  processedChunkCount, 
  showResyncWarning, 
  clearDocs 
}: { 
  uploadedFiles: UploadedFile[], 
  processedChunkCount: number, 
  showResyncWarning: boolean, 
  clearDocs: () => void 
}) {
  return (
    <>
      <div className="p-5 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {showResyncWarning && uploadedFiles.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200"
          >
            <div className="flex items-center gap-2 mb-2">
              <X className="w-4 h-4 rotate-45" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Search Offline</span>
            </div>
            <p className="text-[10px] leading-relaxed opacity-80">
              Document vectors cleared from memory. Re-upload your PDFs to restore semantic search capabilities.
            </p>
          </motion.div>
        )}

        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {uploadedFiles.map((file, idx) => (
              <motion.div
                key={file.name + idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="cursor-pointer p-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3 group hover:border-indigo-500/30 transition-all"
              >
                <div className={cn(
                  "w-8 h-10 flex items-center justify-center rounded border shrink-0",
                  file.status === 'ready' ? "bg-indigo-900/20 border-indigo-500/20" : 
                  file.status === 'processing' ? "bg-blue-900/20 border-blue-500/20" : "bg-red-900/20 border-red-500/20"
                )}>
                  {file.status === 'processing' ? 
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" /> : 
                    <span className={cn(
                      "text-[9px] font-bold",
                      file.status === 'ready' ? "text-indigo-400" : "text-red-400"
                    )}>PDF</span>
                  }
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm text-white truncate font-medium">{file.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {file.status === 'ready' ? `${file.chunkCount || 0} chunks indexed` : 
                     file.status === 'processing' ? 'Processing...' : 'Indexing error'}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {uploadedFiles.length === 0 && (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                <FileText className="w-6 h-6 text-slate-600" />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                No documents uploaded. Chunks will appear here after indexing.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 border-t border-white/5 bg-[#0a0a0c]">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-sans">Storage Status</span>
          <button 
            onClick={() => clearDocs()}
            className="cursor-pointer text-slate-600 hover:text-red-400 transition-colors"
            title="Clear library"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
          <div className="flex items-baseline justify-between mb-2 font-sans">
            <span className="text-xl font-semibold text-white">{processedChunkCount}</span>
            <span className="text-[10px] text-slate-500 font-bold tracking-tighter">TOTAL VECTORS</span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden shadow-inner">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((processedChunkCount / 5000) * 100, 100)}%` }}
              className="h-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.6)]"
            />
          </div>
        </div>

        
      </div>
    </>
  );
}
