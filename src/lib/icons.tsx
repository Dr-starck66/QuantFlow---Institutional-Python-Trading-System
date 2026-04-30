import { FileCode, Download, FolderGit2, Terminal, ShieldAlert, Cpu, Activity, Database, Briefcase } from "lucide-react";
import { pythonCodebase } from "../data/pythonCodebase";

export const getIconForFile = (filename: string) => {
  if (filename.includes("data")) return <Database className="w-4 h-4 text-blue-400" />;
  if (filename.includes("order_flow")) return <Activity className="w-4 h-4 text-green-400" />;
  if (filename.includes("regime")) return <Target className="w-4 h-4 text-yellow-400" />;
  if (filename.includes("ml")) return <Cpu className="w-4 h-4 text-purple-400" />;
  if (filename.includes("risk")) return <ShieldAlert className="w-4 h-4 text-red-400" />;
  if (filename.includes("execution")) return <Terminal className="w-4 h-4 text-orange-400" />;
  if (filename.includes("backtester")) return <FolderGit2 className="w-4 h-4 text-cyan-400" />;
  if (filename.includes("main")) return <Briefcase className="w-4 h-4 text-zinc-300" />;
  return <FileCode className="w-4 h-4 text-zinc-400" />;
};

const Target = ({ className }: { className: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
);
