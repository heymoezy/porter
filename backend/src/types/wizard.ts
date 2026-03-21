export interface ProposedAgent {
  templateId: string;
  name: string;
  role: string;
  portrait: string;    // pixel art sprite reference
  whyChosen: string;
}

export interface WizardProposal {
  projectName: string;
  projectType: string;  // website | app | presentation | research | content | design | ops | custom
  agents: ProposedAgent[];
  milestones: string[];
  scopeLabel: string;   // "Small (1-2 weeks)" | "Medium (1 month)" | "Large (2+ months)"
  explanation: string;  // Why Porter chose this configuration
}

export interface WizardDetectResult {
  isProject: boolean;
  clarity: 'clear' | 'vague' | 'ambiguous';
  suggestedQuestions: WizardQuestion[];
}

export interface WizardQuestion {
  id: string;
  text: string;
  options: WizardOption[];
}

export interface WizardOption {
  id: string;
  label: string;
  description?: string;
}

export interface WizardProposeResult {
  proposal: WizardProposal;
}

export interface WizardApproveResult {
  projectId: string;
  agentIds: string[];
  jobIds: string[];
}
