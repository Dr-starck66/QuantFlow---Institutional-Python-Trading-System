import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Copy, Check, Info } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { pythonCodebase } from './data/pythonCodebase';
import { getIconForFile } from './lib/icons';
import { cn } from './lib/utils';

export default function App() {
  const [activeFile, setActiveFile] = useState(Object.keys(pythonCodebase)[0]);
  const [copied, setCopied] = useState(false);
  const [showNotice, setShowNotice] = useState(true);

  const currentFileData = pythonCodebase[activeFile];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentFileData.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadAll = () => {
    // Creates a zip or multiple files download logic here
    // For simplicity in the browser sandbox, we offer a text download of the unified system
    const unifiedCode = Object.values(pythonCodebase)
      .map(v => `# ==========================================\n# ${v.filename}\n# ==========================================\n\n${v.code}`)
      .join('\n\n\n');
      
    const blob = new Blob([unifiedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'QuantFlow_System.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0E1117] text-zinc-300 font-sans overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#161B22] border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600/20 p-2 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-blue-400">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">QuantFlow</h1>
            <p className="text-xs text-zinc-500">Institutional Python Trading Architecture</p>
          </div>
        </div>
        
        <button
          onClick={handleDownloadAll}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
        >
          <Download className="w-4 h-4" />
          Download System (Merged)
        </button>
      </header>

      {/* Main UI */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-[#0d1117] border-r border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Project Files
          </div>
          <nav className="flex-1 px-2 space-y-1">
            {Object.entries(pythonCodebase).map(([key, data]) => (
              <button
                key={key}
                onClick={() => setActiveFile(key)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all text-left",
                  activeFile === key 
                    ? "bg-[#1f2937] text-white shadow-sm border border-zinc-700/50" 
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                )}
              >
                {getIconForFile(data.filename)}
                <span className="truncate">{data.filename}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Code Editor Area */}
        <div className="flex-1 flex flex-col bg-[#010409] overflow-hidden">
          
          <AnimatePresence>
            {showNotice && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, padding: 0 }}
                className="bg-blue-900/20 border-b border-blue-900/40 px-4 py-3 flex items-start gap-3 shrink-0"
              >
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-blue-200">
                    <strong className="text-white">Environment Notice:</strong> You requested a fully native Python application with system-level libraries (MT5, XGBoost, PyTorch). 
                    Since this interface is a React/Node.js web development environment, I have built a dedicated <strong>Codebase Explorer</strong>. 
                    You can inspect the production-grade Python architecture here, and use the download button to export it for local execution.
                  </p>
                </div>
                <button onClick={() => setShowNotice(false)} className="text-blue-400 hover:text-white p-1">
                  &times;
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between px-4 py-2 bg-[#0d1117] border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-3">
              {getIconForFile(currentFileData.filename)}
              <span className="text-sm font-medium text-zinc-300 font-mono">
                {currentFileData.filename}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
          
          <div className="px-4 py-3 bg-[#161B22] border-b border-zinc-800 shrink-0">
            <p className="text-sm text-zinc-400">
              {currentFileData.description}
            </p>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar relative font-mono text-[13px]">
            <SyntaxHighlighter
              language="python"
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                padding: '1.5rem',
                background: 'transparent',
                backgroundColor: 'transparent',
              }}
              showLineNumbers={true}
              wrapLines={false}
            >
              {currentFileData.code}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>
    </div>
  );
}
