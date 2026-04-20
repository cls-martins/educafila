import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Menu,
  User as UserIcon,
  Moon,
  Sun,
  HelpCircle,
  Smartphone,
  LogOut,
} from 'lucide-react';
import { ProfileDialog } from './ProfileDialog';
import { HelpDialog, AppDownloadDialog } from './StudentDialogs';

export const StudentMenu: React.FC = () => {
  const { signOut, profile } = useAuth();
  const { theme, toggle } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [appOpen, setAppOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menu"
            data-testid="student-menu-trigger"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" data-testid="student-menu-content">
          <DropdownMenuLabel className="truncate">
            {profile?.full_name || 'Aluno'}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setProfileOpen(true)}
            data-testid="menu-profile"
          >
            <UserIcon className="mr-2 h-4 w-4" /> Perfil
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle} data-testid="menu-theme">
            {theme === 'dark' ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHelpOpen(true)} data-testid="menu-help">
            <HelpCircle className="mr-2 h-4 w-4" /> Ajuda
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAppOpen(true)} data-testid="menu-app">
            <Smartphone className="mr-2 h-4 w-4" /> App
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={signOut}
            className="text-destructive focus:text-destructive"
            data-testid="menu-logout"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <AppDownloadDialog open={appOpen} onOpenChange={setAppOpen} />
    </>
  );
};
