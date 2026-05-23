import Settings from '../../pages/Settings';
import AppModalShell from '../common/AppModalShell';

export default function SettingsModal({ open, onClose }) {
  return (
    <AppModalShell open={open} onClose={onClose} title="Settings" size="xl">
      <Settings embedded />
    </AppModalShell>
  );
}
