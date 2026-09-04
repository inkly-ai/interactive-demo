import type { ButtonAction, Cta, DemoConfig, Step } from "@inkly-org/interactive-demo";

export type DeleteStepResult = {
    config: DemoConfig;
    deletedStep: Step;
    fallbackStepId: string | null;
};

function retargetDeletedAction(
    action: ButtonAction,
    deletedStepId: string,
    removedChapterIds: ReadonlySet<string>,
    fallbackStepId: string | null,
): ButtonAction {
    if (action.type === "step" && action.stepId === deletedStepId) {
        return fallbackStepId
            ? { type: "step", stepId: fallbackStepId }
            : { type: "next" };
    }
    if (action.type === "chapter" && removedChapterIds.has(action.chapterId)) {
        return fallbackStepId
            ? { type: "step", stepId: fallbackStepId }
            : { type: "next" };
    }
    return action;
}

function retargetDeletedCta(
    cta: Cta | undefined,
    deletedStepId: string,
    removedChapterIds: ReadonlySet<string>,
    fallbackStepId: string | null,
): Cta | undefined {
    if (!cta?.action) return cta;
    const action = retargetDeletedAction(
        cta.action,
        deletedStepId,
        removedChapterIds,
        fallbackStepId,
    );
    return action === cta.action ? cta : { ...cta, action };
}

function cleanupStepReferences(
    config: DemoConfig,
    deletedStepId: string,
    fallbackStepId: string | null,
): DemoConfig {
    const removedChapterIds = new Set<string>();
    const chapters = config.chapters
        .map((chapter) => ({
            ...chapter,
            stepIds: chapter.stepIds.filter((stepId) => stepId !== deletedStepId),
        }))
        .filter((chapter) => {
            const keep = chapter.stepIds.length > 0;
            if (!keep) removedChapterIds.add(chapter.id);
            return keep;
        });

    const steps = config.steps
        .filter((step) => step.id !== deletedStepId)
        .map((step) => {
            if (step.kind !== "cover") return step;
            return {
                ...step,
                widgets: step.widgets.map((widget) => {
                    if (widget.type === "headline") {
                        return {
                            ...widget,
                            cta: retargetDeletedCta(
                                widget.cta,
                                deletedStepId,
                                removedChapterIds,
                                fallbackStepId,
                            ),
                            secondaryCta: retargetDeletedCta(
                                widget.secondaryCta,
                                deletedStepId,
                                removedChapterIds,
                                fallbackStepId,
                            ),
                        };
                    }
                    if (widget.type === "form") {
                        return {
                            ...widget,
                            submit: retargetDeletedCta(
                                widget.submit,
                                deletedStepId,
                                removedChapterIds,
                                fallbackStepId,
                            ) ?? widget.submit,
                        };
                    }
                    return widget;
                }),
            };
        });

    return { ...config, chapters, steps };
}

export function deleteStepFromConfig(
    config: DemoConfig,
    stepId: string,
): DeleteStepResult | null {
    const index = config.steps.findIndex((step) => step.id === stepId);
    if (index === -1 || config.steps.length <= 1) return null;

    const deletedStep = config.steps[index];
    const fallbackStep =
        config.steps[index + 1] ?? config.steps[index - 1] ?? config.steps[0];
    const fallbackStepId = fallbackStep?.id ?? null;

    return {
        config: cleanupStepReferences(config, stepId, fallbackStepId),
        deletedStep,
        fallbackStepId,
    };
}
