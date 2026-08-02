import { useState } from 'react';
import { BulkPasteStep } from './BulkPasteStep';
import { SortBoard } from './SortBoard';
import { parseBulkLinks, WizardLinkDraft } from '../../lib/parseBulkLinks';
import { LinkItem, LinkSection } from '../../types';

const UNSORTED_SECTION_ID = 'unsorted';

interface OnboardingWizardProps {
  /** Existing sections to offer as drop targets. Omit for first-run onboarding. */
  existingSections?: LinkSection[];
  /** Called with newly-created sections and all newly-added links. Append, don't replace. */
  onComplete: (newSections: LinkSection[], newLinks: LinkItem[]) => void;
  /** When provided, the wizard is reopened later (not first-run) and can be backed out of. */
  onCancel?: () => void;
}

export function OnboardingWizard({ existingSections, onComplete, onCancel }: OnboardingWizardProps) {
  const [step, setStep] = useState<'paste' | 'sort'>('paste');
  const [links, setLinks] = useState<WizardLinkDraft[]>([]);

  if (step === 'paste') {
    return (
      <BulkPasteStep
        unsortedSectionId={UNSORTED_SECTION_ID}
        onCancel={onCancel}
        onContinue={(raw) => {
          const parsed = parseBulkLinks(raw, UNSORTED_SECTION_ID);
          if (parsed.length === 0) {
            if (onCancel) onCancel();
            else onComplete([], []);
            return;
          }
          setLinks(parsed);
          setStep('sort');
        }}
      />
    );
  }

  return <SortBoard initialLinks={links} existingSections={existingSections} onDone={onComplete} onCancel={onCancel} />;
}
