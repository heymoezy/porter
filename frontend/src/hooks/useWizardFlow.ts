import { useCallback } from 'react';
import { useAppStore } from '../store/app';
import { api } from '../lib/api';

interface DetectResponse {
  data: {
    isProject: boolean;
    clarity: 'clear' | 'vague' | 'ambiguous';
    suggestedQuestions: Array<{
      id: string;
      text: string;
      options: Array<{ id: string; label: string; description?: string }>;
    }>;
  };
}

interface ProposeResponse {
  data: {
    proposal: {
      projectName: string;
      projectType: string;
      agents: Array<{ templateId: string; name: string; role: string; portrait: string; whyChosen: string }>;
      milestones: string[];
      scopeLabel: string;
      explanation: string;
    };
  };
}

interface ApproveResponse {
  data: {
    projectId: string;
    agentIds: string[];
    jobIds: string[];
  };
}

export function useWizardFlow() {
  const {
    wizardStage, setWizardStage, setWizardProposal,
    resetWizard, setActiveProjectId, setActiveTab,
  } = useAppStore();

  // Step 2: Generate proposal after questions answered
  const generateProposal = useCallback(async (goal: string, answers: string[]) => {
    setWizardStage('proposing');
    try {
      const res = await api<ProposeResponse>('/api/v1/projects/wizard', {
        json: { action: 'propose', goal, answers },
      });
      setWizardProposal(res.data.proposal);
    } catch (e) {
      console.error('Wizard propose failed:', e);
      setWizardStage('idle');
    }
  }, [setWizardStage, setWizardProposal]);

  // Step 1: Detect project intent in a user message
  const detectIntent = useCallback(async (message: string): Promise<boolean> => {
    if (wizardStage !== 'idle') return false; // Already in wizard flow
    setWizardStage('detecting');
    try {
      const res = await api<DetectResponse>('/api/v1/projects/wizard', {
        json: { action: 'detect', message },
      });
      const { isProject, clarity, suggestedQuestions } = res.data;
      if (!isProject) {
        setWizardStage('idle');
        return false; // Not a project request — let regular chat handle it
      }
      if (clarity === 'clear') {
        // Clear goal — skip questions, go straight to proposal
        await generateProposal(message, []);
        return true;
      }
      if (suggestedQuestions.length > 0) {
        // Vague/ambiguous — ask follow-up questions
        useAppStore.setState({
          wizardStage: 'questioning',
          wizardQuestions: suggestedQuestions,
          wizardAnswers: [message], // Store original goal as first entry
        });
        return true;
      }
      // No questions but not clear — try proposing anyway
      await generateProposal(message, []);
      return true;
    } catch (e) {
      console.error('Wizard detect failed:', e);
      setWizardStage('idle');
      return false;
    }
  }, [wizardStage, setWizardStage, generateProposal]);

  // Step 3: Approve proposal -> create project + agents + jobs
  const approveProposal = useCallback(async () => {
    const proposal = useAppStore.getState().wizardProposal;
    if (!proposal) return;
    try {
      const res = await api<ApproveResponse>('/api/v1/projects/wizard', {
        json: { action: 'approve', proposal },
      });
      setWizardStage('approved');
      setActiveProjectId(res.data.projectId);
      // After a brief delay, switch to projects tab to show dashboard
      setTimeout(() => {
        setActiveTab('projects');
      }, 1500);
    } catch (e) {
      console.error('Wizard approval failed:', e);
      // Stay in proposing state so user can retry
    }
  }, [setWizardStage, setActiveProjectId, setActiveTab]);

  // Refinement: user describes changes conversationally
  const refineProposal = useCallback(async (refinementMessage: string) => {
    const currentProposal = useAppStore.getState().wizardProposal;
    if (!currentProposal) return;
    setWizardStage('refining');
    try {
      // Send refinement as a new propose with the original goal + refinement context
      const goal = `Refine this project: ${currentProposal.projectName}. User says: "${refinementMessage}". Original config: ${JSON.stringify(currentProposal)}`;
      const res = await api<ProposeResponse>('/api/v1/projects/wizard', {
        json: { action: 'propose', goal, answers: [] },
      });
      setWizardProposal(res.data.proposal);
      setWizardStage('proposing');
    } catch (e) {
      console.error('Wizard refinement failed:', e);
      setWizardStage('proposing'); // Fall back to current proposal
    }
  }, [setWizardStage, setWizardProposal]);

  // Complete question answering — called when all questions answered
  const completeQuestions = useCallback(async () => {
    const state = useAppStore.getState();
    const goal = state.wizardAnswers[0] || ''; // First answer is the original goal
    const answers = state.wizardAnswers.slice(1); // Rest are question answers
    await generateProposal(goal, answers);
  }, [generateProposal]);

  return {
    detectIntent,
    generateProposal,
    approveProposal,
    refineProposal,
    completeQuestions,
    resetWizard,
    wizardStage,
  };
}
