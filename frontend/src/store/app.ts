import { create } from 'zustand';

export type TabId =
  | 'chat'
  | 'orchestration'
  | 'memory'
  | 'extensions'
  | 'projects'
  | 'workflows'
  | 'locations'
  | 'files'
  | 'health'
  | 'connections';

type ThemePreference = 'system' | 'dark' | 'light';

function applyTheme(theme: ThemePreference) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('porter_theme', theme);
}

// Wizard types
type WizardStage = 'idle' | 'detecting' | 'questioning' | 'proposing' | 'refining' | 'approved';

interface ProposedAgentUI {
  templateId: string;
  name: string;
  role: string;
  portrait: string;
  whyChosen: string;
}

interface WizardProposal {
  projectName: string;
  projectType: string;
  agents: ProposedAgentUI[];
  milestones: string[];
  scopeLabel: string;
  explanation: string;
}

interface WizardQuestionData {
  id: string;
  text: string;
  options: { id: string; label: string; description?: string }[];
}

interface AppState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  themePreference: ThemePreference;
  cycleTheme: () => void;

  // Wizard state machine
  wizardStage: WizardStage;
  wizardProposal: WizardProposal | null;
  wizardQuestions: WizardQuestionData[];
  wizardAnswers: string[];
  setWizardStage: (stage: WizardStage) => void;
  setWizardProposal: (proposal: WizardProposal | null) => void;
  addWizardAnswer: (answer: string) => void;
  resetWizard: () => void;

  // GSD mode — per-project, persisted to localStorage
  gsdModes: Record<string, boolean>;  // { [projectId]: boolean }
  setGsdMode: (projectId: string, mode: boolean) => void;
  getGsdMode: (projectId: string) => boolean;

  // Active project context
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
}

const CYCLE: Record<ThemePreference, ThemePreference> = {
  system: 'dark',
  dark: 'light',
  light: 'system',
};

const savedTheme = (localStorage.getItem('porter_theme') as ThemePreference) || 'system';

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'chat',
  setActiveTab: (tab) => set({ activeTab: tab }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  themePreference: savedTheme,
  cycleTheme: () => {
    const next = CYCLE[get().themePreference];
    applyTheme(next);
    set({ themePreference: next });
  },

  // Wizard
  wizardStage: 'idle',
  wizardProposal: null,
  wizardQuestions: [],
  wizardAnswers: [],
  setWizardStage: (stage) => set({ wizardStage: stage }),
  setWizardProposal: (proposal) => set({ wizardProposal: proposal }),
  addWizardAnswer: (answer) => set((s) => ({ wizardAnswers: [...s.wizardAnswers, answer] })),
  resetWizard: () => set({ wizardStage: 'idle', wizardProposal: null, wizardQuestions: [], wizardAnswers: [] }),

  // GSD mode
  gsdModes: JSON.parse(localStorage.getItem('porter_gsd_modes') || '{}'),
  setGsdMode: (projectId, mode) => set((s) => {
    const updated = { ...s.gsdModes, [projectId]: mode };
    localStorage.setItem('porter_gsd_modes', JSON.stringify(updated));
    return { gsdModes: updated };
  }),
  getGsdMode: (projectId) => get().gsdModes[projectId] ?? false,

  // Active project
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),
}));
