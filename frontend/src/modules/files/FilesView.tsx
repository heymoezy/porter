import { useEffect } from 'react';
import { useFileStore } from '../../store/files';
import { Folder, FileText, Download, Trash2, ChevronRight, HardDrive, File as FileIcon, Search } from 'lucide-react';

function formatSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function FilesView() {
  const { currentPath, files, isLoading, fetchFiles, downloadFile, deleteFile } = useFileStore();

  useEffect(() => {
    fetchFiles('/');
  }, [fetchFiles]);

  const navigate = (path: string) => {
    fetchFiles(path);
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-900/30">
      <div className="p-8 border-b border-neutral-800 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100">Files</h1>
            <p className="text-sm text-neutral-500">Secure storage and transfer management.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search files..." 
                className="bg-neutral-800/50 border border-neutral-700/50 focus:border-orange-500/50 rounded-xl pl-10 pr-4 py-2 text-sm text-neutral-200 focus:ring-0 transition-all w-64"
              />
            </div>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <button 
            onClick={() => navigate('/')}
            className="text-neutral-500 hover:text-orange-500 transition-colors flex items-center gap-1"
          >
            <HardDrive className="w-3.5 h-3.5" />
            root
          </button>
          {breadcrumbs.map((part, i) => (
            <div key={i} className="flex items-center gap-2">
              <ChevronRight className="w-3 h-3 text-neutral-700" />
              <button 
                onClick={() => navigate('/' + breadcrumbs.slice(0, i + 1).join('/'))}
                className="text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                {part}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-neutral-800/20 border border-neutral-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase font-bold tracking-wider">
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Size</th>
                  <th className="px-6 py-4">Modified</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {currentPath !== '/' && (
                  <tr 
                    className="hover:bg-neutral-800/30 transition-colors cursor-pointer group"
                    onClick={() => {
                      const parts = currentPath.split('/').filter(Boolean);
                      parts.pop();
                      navigate('/' + parts.join('/'));
                    }}
                  >
                    <td colSpan={4} className="px-6 py-3 text-neutral-500 text-xs font-medium group-hover:text-neutral-300">
                      .. / (Parent Directory)
                    </td>
                  </tr>
                )}
                
                {files.map((file) => (
                  <tr 
                    key={file.path} 
                    className="hover:bg-neutral-800/30 transition-colors cursor-pointer group"
                    onClick={() => file.is_dir && navigate(file.path)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {file.is_dir ? (
                          <Folder className="w-4 h-4 text-orange-500/60" />
                        ) : (
                          <FileText className="w-4 h-4 text-neutral-500" />
                        )}
                        <span className={`font-medium ${file.is_dir ? 'text-neutral-200' : 'text-neutral-400'}`}>
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-neutral-500 text-xs">
                      {file.is_dir ? '—' : formatSize(file.size)}
                    </td>
                    <td className="px-6 py-4 text-neutral-500 text-xs">
                      {new Date(file.mtime * 1000).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!file.is_dir && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); downloadFile(file.path); }}
                            className="p-1.5 text-neutral-500 hover:text-orange-500 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteFile(file.path); }}
                          className="p-1.5 text-neutral-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {!isLoading && files.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center">
                      <div className="space-y-2">
                        <FileIcon className="w-8 h-8 text-neutral-700 mx-auto" />
                        <p className="text-sm text-neutral-500">Empty directory</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
