import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';

export function GlobalShortcutLayer() {
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const { helpOpen, setHelpOpen, shortcuts } = useKeyboardShortcuts(handleRefresh);

  return (
    <ShortcutHelpDialog
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      shortcuts={shortcuts}
    />
  );
}
