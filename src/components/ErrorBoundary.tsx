import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || String(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let parsedError: Record<string, unknown> | null = null;
      try {
        parsedError = JSON.parse(this.state.errorMessage);
      } catch {
        parsedError = null;
      }

      return (
        <div className="min-h-screen bg-[#F4F4F0] flex items-center justify-center p-6">
          <div className="nb-card-lg max-w-2xl w-full p-8 bg-white">
            <div className="flex items-center gap-3 mb-4 bg-[#FFDC00] border-2 border-black p-3">
              <AlertTriangle className="w-7 h-7 shrink-0" />
              <h1 className="text-2xl font-display font-extrabold uppercase">
                Error de Operación del Sistema
              </h1>
            </div>
            <p className="text-base mb-4 font-medium">
              Se detectó una interrupción al procesar la solicitud en tiempo real.
            </p>
            {parsedError ? (
              <div className="bg-[#F4F4F0] border-2 border-black p-4 mb-6 font-mono-data text-xs overflow-x-auto">
                <div>
                  <strong>Operación:</strong> {String(parsedError.operationType || '')}
                </div>
                <div>
                  <strong>Ruta:</strong> {String(parsedError.path || '')}
                </div>
                <div>
                  <strong>Detalle:</strong> {String(parsedError.error || '')}
                </div>
              </div>
            ) : (
              <div className="bg-[#F4F4F0] border-2 border-black p-4 mb-6 font-mono-data text-xs overflow-x-auto">
                {this.state.errorMessage}
              </div>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="nb-btn bg-[#B8FF9F] px-6 py-3 font-display font-bold flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              REINTENTAR CONEXIÓN
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
