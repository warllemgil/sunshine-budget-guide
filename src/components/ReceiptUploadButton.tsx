import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X } from 'lucide-react';
import { useReceipts } from '@/hooks/useReceipts';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface ReceiptUploadButtonProps {
  onUploadSuccess: (path: string, fileName: string) => void;
}

export const ReceiptUploadButton = ({ onUploadSuccess }: ReceiptUploadButtonProps) => {
  const { user } = useAuth();
  const { uploadReceipt, loading } = useReceipts();
  const { toast } = useToast();
  const [selected, setSelected] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isGoogleSession = user?.app_metadata?.provider === 'google';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Erro', description: 'Por favor, selecione uma imagem (JPG, PNG, GIF) ou PDF', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'Arquivo muito grande. Máximo 10MB', variant: 'destructive' });
      return;
    }
    setSelected(file);
  };

  const handleUpload = async () => {
    if (!selected || !user) return;
    const path = await uploadReceipt(selected, user.id);
    if (path) {
      onUploadSuccess(path, selected.name);
      setSelected(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <p className="text-xs text-muted-foreground">Destino: Google Drive (sem uso de armazenamento do Supabase).</p>
      {!isGoogleSession && (
        <p className="text-[11px] text-destructive">
          Entre com conta Google para enviar comprovantes.
        </p>
      )}
      {isGoogleSession && (
        <p className="text-[11px] text-muted-foreground">
          Imagens serao compactadas automaticamente antes do upload para economizar espaco.
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        onChange={handleFileSelect}
        disabled={loading}
        className="hidden"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          <Upload className="h-4 w-4 mr-2" />
          Selecionar Comprovante
        </Button>
        {selected && (
          <>
            <span className="text-sm text-gray-600 truncate flex items-center flex-1">
              {selected.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {selected && (
        <Button
          type="button"
          onClick={handleUpload}
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Enviando...' : 'Fazer Upload do Comprovante'}
        </Button>
      )}
    </div>
  );
};
