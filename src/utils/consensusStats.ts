import type { Initiative } from "./dashboardStats";

export interface ConsensusMetric {
    consensusIndex: number;
    label: "Unanimidad" | "Gran Acuerdo" | "División" | "Ajustada" | "Sin Votación";
    color: string;
}

export function calculateConsensus(initiative: Initiative): ConsensusMetric {
    if (!initiative.voting || !initiative.voting.exists) {
        return { consensusIndex: 0, label: "Sin Votación", color: "#e5e7eb" };
    }

    const yes = initiative.voting.yes || 0;
    const no = initiative.voting.no || 0;
    const totalVotes = yes + no; // We exclude abstentions for "Polarization" usually, or include them? 
    // User formula: (afavor / (afavor + enContra)) * 100.

    if (totalVotes === 0) return { consensusIndex: 0, label: "Sin Votación", color: "#e5e7eb" };

    const ratio = (yes / totalVotes) * 100;
    const consensusIndex = Math.round(ratio);

    // Classification
    let label: ConsensusMetric["label"] = "División"; // Default
    let color = "#3B82F6";

    if (consensusIndex === 100 && no === 0) {
        label = "Unanimidad";
        color = "#10B981"; // Strong Green
    } else if (consensusIndex >= 80) {
        label = "Gran Acuerdo";
        color = "#34D399"; // Light Green
    } else if (consensusIndex <= 55 && consensusIndex >= 45) { // "Ajustada" typically means close to 50/50
        label = "Ajustada";
        color = "#F59E0B"; // Orange
    } else if (consensusIndex < 45) {
        // Should calculate rejection consensus? Usually we measure "Agreement" to the proposal.
        // If ratio is low, it means high consensus AGAINST.
        // But per request: Division is 51-79. Adjusted <= 55. 
        // Let's stick to the prompt's request loosely but keeping logic sound.
        // Prompt: "Ajustada": IC <= 55%.
        if (consensusIndex <= 55) {
            label = "Ajustada";
            color = "#EF4444"; // Red (High tension/Risk)
        }
    } else {
        // 56 - 79
        label = "División";
        color = "#FBBF24"; // Yellow
    }

    return { consensusIndex, label, color };
}

export function getAffinity(initiatives: Initiative[], targetCode: string, referenceCode: string = "GS"): number {
    // Count how many times Target voted SAME as Reference
    let matches = 0;
    let totalComparisons = 0;

    initiatives.forEach(init => {
        if (!init.voting?.exists || !init.voting.result?.desglose) return;

        const desglose = init.voting.result.desglose;

        // Find where Reference voted
        let refVote = "";
        if (desglose.yes && Object.keys(desglose.yes).some(k => k.includes(referenceCode))) refVote = "yes";
        else if (desglose.no && Object.keys(desglose.no).some(k => k.includes(referenceCode))) refVote = "no";
        else if (desglose.abstention && Object.keys(desglose.abstention).some(k => k.includes(referenceCode))) refVote = "abs";

        // Find where Target voted
        let targetVote = "";
        if (desglose.yes && Object.keys(desglose.yes).some(k => k.includes(targetCode))) targetVote = "yes";
        else if (desglose.no && Object.keys(desglose.no).some(k => k.includes(targetCode))) targetVote = "no";
        else if (desglose.abstention && Object.keys(desglose.abstention).some(k => k.includes(targetCode))) targetVote = "abs";

        if (refVote && targetVote) {
            totalComparisons++;
            if (refVote === targetVote) matches++;
        }
    });

    return totalComparisons > 0 ? Math.round((matches / totalComparisons) * 100) : 0;
}

export function getRankings(initiatives: Initiative[]) {
    // Filter only those with votes
    const voted = initiatives.filter(i => i.voting?.exists);

    const details = voted.map(i => {
        const metric = calculateConsensus(i);
        return { ...i, ...metric };
    });

    // Top Consensus
    const sorted = [...details].sort((a, b) => b.consensusIndex - a.consensusIndex);
    const topConsensus = sorted.slice(0, 5);

    // Top Divisive (Closest to 50%)
    // Calculate distance to 50. Smaller distance = more divisive/adjusted.
    const sortedDivisive = [...details].sort((a, b) => {
        const distA = Math.abs(a.consensusIndex - 50);
        const distB = Math.abs(b.consensusIndex - 50);
        return distA - distB;
    });
    const topDivisive = sortedDivisive.slice(0, 5);

    return { topConsensus, topDivisive };
}
