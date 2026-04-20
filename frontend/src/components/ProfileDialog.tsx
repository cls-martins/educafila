import React, { useMemo, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const COLOR_PALETTE = [
  '#1f2937', // default gray-800
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // yellow-ish (safe, not white)
  '#16a34a', // green
  '#0891b2', // cyan
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#000000', // black
];

const isBlockedColor = (hex: string) => {
  const v = hex.trim().toLowerCase();
  if (v === '#ffffff' || v === '#fff' || v === 'white') return true;
  // Block near-white too (very high luminance)
  if (/^#[0-9a-f]{6}$/.test(v)) {
    const r = parseInt(v.slice(1, 3), 16);
    const g = parseInt(v.slice(3, 5), 16);
    const b = parseInt(v.slice(5, 7), 16);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 235;
  }
  return false;
};

export const ProfileDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { profile, user, refreshProfile } = useAuth() as any;
  const { toast } = useToast();
  const tokens = useMemo(
    () => (profile?.full_name || '').split(/\s+/).filter(Boolean),
    [profile?.full_name],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [color, setColor] = useState<string>('#1f2937');
  const [customColor, setCustomColor] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const existing: string[] | null = (profile as any)?.display_name_tokens ?? null;
    if (existing && existing.length > 0) setSelected(existing);
    else setSelected(tokens.slice(0, 2));
    setColor((profile as any)?.name_color || '#1f2937');
    setCustomColor('');
    setAvatarUrl((profile as any)?.avatar_url || null);
  }, [open, profile, tokens]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 2 MB.', variant: 'destructive' });
      return;
    }
    setUploadingAvatar(true);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingAvatar(false);
      toast({ title: 'Erro ao enviar foto', description: upErr.message, variant: 'destructive' });
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = pub.publicUrl;
    // Persist immediately so the avatar shows even if user cancels other edits.
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: url } as any)
      .eq('user_id', user.id);
    setUploadingAvatar(false);
    if (updErr) {
      toast({ title: 'Erro ao salvar foto', description: updErr.message, variant: 'destructive' });
      return;
    }
    setAvatarUrl(url);
    toast({ title: 'Foto atualizada' });
    if (typeof refreshProfile === 'function') await refreshProfile();
  };

  const handleAvatarRemove = async () => {
    if (!user?.id) return;
    setUploadingAvatar(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null } as any)
      .eq('user_id', user.id);
    setUploadingAvatar(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setAvatarUrl(null);
    toast({ title: 'Foto removida' });
    if (typeof refreshProfile === 'function') await refreshProfile();
  };

  const toggleToken = (t: string) => {
    setSelected((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleSave = async () => {
    if (selected.length < 2) {
      toast({
        title: 'Escolha pelo menos 2 nomes',
        variant: 'destructive',
      });
      return;
    }
    const finalColor = customColor || color;
    if (isBlockedColor(finalColor)) {
      toast({
        title: 'Cor inválida',
        description: 'Branco é a cor da fila — o nome sumiria. Escolha outra cor.',
        variant: 'destructive',
      });
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    // Keep order matching the original full_name order
    const ordered = tokens.filter((t) => selected.includes(t));
    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name_tokens: ordered,
        name_color: finalColor,
      } as any)
      .eq('user_id', user.id)
      .select('user_id, display_name_tokens, name_color');
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    if (!data || data.length === 0) {
      toast({
        title: 'Não foi possível salvar',
        description: 'Seu perfil não foi atualizado (verifique permissões).',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Perfil atualizado' });
    if (typeof refreshProfile === 'function') await refreshProfile();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="profile-dialog">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
          <DialogDescription>
            Escolha como seu nome aparecerá na fila. Selecione pelo menos 2 nomes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4" data-testid="avatar-section">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-border bg-secondary">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Foto de perfil"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                  {(profile?.full_name || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
                data-testid="avatar-file-input"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                  data-testid="avatar-upload-btn"
                >
                  <Camera className="mr-1 h-4 w-4" />
                  {uploadingAvatar ? 'Enviando…' : avatarUrl ? 'Trocar foto' : 'Enviar foto'}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleAvatarRemove}
                    disabled={uploadingAvatar}
                    data-testid="avatar-remove-btn"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG ou WEBP — máx. 2 MB.
              </p>
            </div>
          </div>

          <div>
            <Label className="text-xs">Nomes a exibir</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {tokens.map((t) => (
                <label
                  key={t}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                    selected.includes(t)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-secondary'
                  }`}
                  data-testid={`profile-token-${t}`}
                >
                  <Checkbox
                    checked={selected.includes(t)}
                    onCheckedChange={() => toggleToken(t)}
                  />
                  {t}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Pré-visualização:{' '}
              <span
                style={{ color: customColor || color }}
                className="font-semibold"
                data-testid="profile-preview"
              >
                {tokens
                  .filter((t) => selected.includes(t))
                  .join(' ') || 'Selecione os nomes'}
              </span>
            </p>
          </div>

          <div>
            <Label className="text-xs">Cor do nome</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    setCustomColor('');
                  }}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    (customColor || color) === c
                      ? 'border-foreground ring-2 ring-foreground/30'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                  data-testid={`profile-color-${c}`}
                />
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColor || color}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border"
                  data-testid="profile-color-custom"
                />
                <span className="text-xs text-muted-foreground">personalizada</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A cor branca é bloqueada para que seu nome não desapareça na fila.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="profile-save-btn">
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
