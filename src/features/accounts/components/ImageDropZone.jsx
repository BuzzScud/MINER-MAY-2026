import { useRef, useState } from 'react';
import { parsePerformanceImage } from '../utils/ocrParser';

function formatCurrency(value) {
  const numberValue = Number(value) || 0;
  return numberValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ImageDropZone({ onDataExtracted, onCancel }) {
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [extractedData, setExtractedData] = useState(null);

  const acceptPattern = '.png,.jpg,.jpeg';

  const runExtraction = async (file) => {
    if (!file) return;
    const isValidType = ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type);
    if (!isValidType) {
      setError('Unsupported file type. Please upload PNG or JPG.');
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    setError('');
    setExtractedData(null);
    setIsProcessing(true);
    setProgressText('Preparing OCR...');

    try {
      const parsedData = await parsePerformanceImage(file, (message) => {
        const statusText = `${message.status || 'processing'} ${message.progress ? `${Math.round(message.progress * 100)}%` : ''}`.trim();
        setProgressText(statusText);
      });
      setExtractedData(parsedData);
    } catch (processingError) {
      setError(processingError?.message || "Couldn't read image - try a clearer screenshot.");
    } finally {
      setIsProcessing(false);
    }
  };

  const onInputChange = async (event) => {
    const file = event.target.files?.[0];
    await runExtraction(file);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    await runExtraction(file);
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`w-full bg-gray-50 dark:bg-gray-900/50 border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-500'
        }`}
      >
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Drop screenshot here or click to upload</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">PNG, JPG, JPEG supported</p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={acceptPattern}
        onChange={onInputChange}
        className="hidden"
      />

      {previewUrl && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Image preview</p>
          <img src={previewUrl} alt="Screenshot preview" className="max-h-64 rounded border border-gray-200 dark:border-gray-700 mx-auto" />
        </div>
      )}

      {isProcessing && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5">
          <p className="text-sm text-blue-800 dark:text-blue-300">Processing...</p>
          <p className="text-xs text-blue-600 dark:text-blue-200/90 mt-1">{progressText}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {extractedData && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Review Extracted Data</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Month</p>
              <p className="text-gray-900 dark:text-white font-medium">
                {extractedData.month} {extractedData.year}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Monthly Total P/L</p>
              <p className={`font-medium ${extractedData.totalPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(extractedData.totalPL)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Daily Entries</p>
              <p className="text-gray-900 dark:text-white font-medium">{Object.keys(extractedData.days || {}).length}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Weekly Totals</p>
              <p className="text-gray-900 dark:text-white font-medium">{(extractedData.weeks || []).length}</p>
            </div>
          </div>

          <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr className="text-gray-500 dark:text-gray-400">
                  <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                  <th className="px-2 py-1.5 text-right font-semibold">P/L</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Trades</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(extractedData.days || {})
                  .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
                  .map(([dateKey, dayData]) => (
                    <tr key={dateKey} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-2 py-1.5 text-gray-900 dark:text-gray-200">{dateKey}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${dayData.pl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(dayData.pl)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-900 dark:text-gray-200">{dayData.trades}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setExtractedData(null);
                setError('');
                if (onCancel) onCancel();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (onDataExtracted) onDataExtracted(extractedData);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Apply to Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
