import type { Initiative } from "./dashboardStats";

export interface ParticipationStats {
    globalCommitment: number;
    totalVoted: number;
    totalPossibleVotes: number;
    totalAbstentions: number;
    totalNoVotes: number;
    absenteeismRanking: { party: string; count: number }[];
    criticalAbsences: {
        initiative: Initiative;
        margin: number;
        missing: number;
    }[];
    brokenBlocks: {
        initiative: Initiative;
        party: string;
        details: string; // e.g. "90 votes YES vs 2 votes NO"
    }[];
    deputyRanking: {
        name: string;
        party: string;
        count: number;
        avatar?: string;
    }[];
}

export function calculateParticipationStats(initiatives: Initiative[]): ParticipationStats {
    let totalPresent = 0;
    let totalVoted = 0;
    let totalAbstentions = 0;
    const noVotesByParty: Record<string, number> = {};
    const criticalAbsences: ParticipationStats["criticalAbsences"] = [];
    const brokenBlocks: ParticipationStats["brokenBlocks"] = [];

    initiatives.forEach(init => {
        if (!init.voting?.exists || !init.voting.result?.totales || !init.voting.result.desglose) return;

        const totals = init.voting.result.totales;
        const desglose = init.voting.result.desglose;

        // 1. Global Commitment
        // Note: 'presentes' usually implies they are in the chamber. 'noVotan' are present but didn't press button.
        // Or sometimes absenteeism is calculated as 'Composicion (350) - Votos Emitidos'.
        // Based on JSON: 'presentes', 'afavor', 'enContra', 'abstenciones', 'noVotan'.
        // Votes Cast = afavor + enContra + abstenciones.
        const votesCast = (totals.afavor || 0) + (totals.enContra || 0) + (totals.abstenciones || 0);
        const present = totals.presentes || 350; // Fallback

        totalVoted += votesCast;
        totalPresent += present;
        totalAbstentions += (totals.abstenciones || 0);

        // 2. Absenteeism Ranking (Party Level)
        // Check desglose.no_vote -> { "GVOX": 2, "GP": 1 }
        if (desglose.no_vote) {
            Object.entries(desglose.no_vote).forEach(([party, count]) => {
                noVotesByParty[party] = (noVotesByParty[party] || 0) + (count as number);
            });
        }

        // 3. Critical Absences
        const missing = totals.noVotan || 0;
        if (missing > 0) {
            const margin = Math.abs((totals.afavor || 0) - (totals.enContra || 0));
            // If missing votes could have covered the margin
            if (missing >= margin) {
                criticalAbsences.push({
                    initiative: init,
                    margin,
                    missing
                });
            }
        }

        // 4. Broken Blocks (Dissidence)
        // Simplistic logic: Check if a party appears in multiple vote categories (yes, no, abstention, no_vote)
        const partyVotes: Record<string, { yes: number, no: number, abs: number, no_vote: number }> = {};

        const countVotes = (category: string, source: any) => {
            if (!source) return;
            Object.entries(source).forEach(([party, count]) => {
                if (!partyVotes[party]) partyVotes[party] = { yes: 0, no: 0, abs: 0, no_vote: 0 };
                // @ts-ignore
                partyVotes[party][category] += (count as number);
            });
        };

        countVotes('yes', desglose.yes);
        countVotes('no', desglose.no);
        countVotes('abs', desglose.abstention);
        countVotes('no_vote', desglose.no_vote);

        Object.entries(partyVotes).forEach(([party, votes]) => {
            const totalPartyVotes = votes.yes + votes.no + votes.abs + votes.no_vote;
            if (totalPartyVotes < 5) return; // Ignore small parties/fractions for noise reduction

            // Check if major consensus
            const maxVote = Math.max(votes.yes, votes.no, votes.abs);
            const consensusRatio = maxVote / totalPartyVotes;

            // If ratio is between 0.5 and 0.99, it implies split.
            // Strict dissidence: One option dominates (>80%), but others exist (>0).
            if (consensusRatio > 0.8 && consensusRatio < 1) {
                // Find minor options
                const minors = [];
                if (votes.yes > 0 && votes.yes !== maxVote) minors.push(`${votes.yes} Sí`);
                if (votes.no > 0 && votes.no !== maxVote) minors.push(`${votes.no} No`);
                if (votes.abs > 0 && votes.abs !== maxVote) minors.push(`${votes.abs} Abs`);
                if (votes.no_vote > 0 && votes.no_vote !== maxVote) minors.push(`${votes.no_vote} No Voto`);

                if (minors.length > 0) {
                    brokenBlocks.push({
                        initiative: init,
                        party: party,
                        details: `Mayoría votó ${votes.yes === maxVote ? 'Sí' : votes.no === maxVote ? 'No' : 'Abs'}, pero hubo: ${minors.join(', ')}`
                    });
                }
            }
        });

    });

    // Formatting Ranking
    const absenteeismRanking = Object.entries(noVotesByParty)
        .map(([party, count]) => ({ party, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Deputy Ranking (Individual)
    const noVotesByDeputy: Record<string, { name: string; party: string; count: number; avatar?: string }> = {};

    initiatives.forEach(init => {
        // Access 'noVote' directly from 'voting' object, as per JSON analysis
        // Also checking missingDeputies as a fallback source if needed, but prioritizing noVote
        const voting = (init.voting as any);
        const noVoteList = voting?.noVote || voting?.missingDeputies || [];

        noVoteList.forEach((deputy: any) => {
            const id = deputy.codParlamentario || deputy.apellidosNombre;
            if (!noVotesByDeputy[id]) {
                const isMixed = deputy.grupo && deputy.grupo.toLowerCase().includes('mixto');
                noVotesByDeputy[id] = {
                    name: deputy.apellidosNombre,
                    party: isMixed ? 'Grupo Mixto' : (deputy.formacion || deputy.grupo),
                    count: 0
                };
            }
            noVotesByDeputy[id].count++;
        });
    });

    const deputyRanking = Object.values(noVotesByDeputy)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // Global Commitment: Average Attendance (Votos Emitidos / 350)
    // We assume 350 seats in the Chamber.
    const totalSeatsOpportunity = initiatives.length * 350;
    const globalCommitment = totalSeatsOpportunity > 0 ? Math.round((totalVoted / totalSeatsOpportunity) * 100) : 0;

    // Total Absences (No Votaron)
    const totalNoVotes = totalSeatsOpportunity - totalVoted;

    return {
        globalCommitment,
        totalVoted,
        totalPossibleVotes: totalSeatsOpportunity,
        totalAbstentions,
        totalNoVotes,
        absenteeismRanking,
        deputyRanking, // New field
        criticalAbsences: criticalAbsences.slice(0, 3), // Top 3
        brokenBlocks: brokenBlocks.slice(0, 3) // Top 3
    };
}
