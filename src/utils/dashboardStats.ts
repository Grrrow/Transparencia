export interface Initiative {
    resultado_tram?: string;
    autor: string;
    titulo: string;
    enlace: string;
    fecha_presentado: string;
    voting?: {
        exists: boolean;
        yes: number;
        no: number;
        abstentions: number;
        presentes?: number;
        missingDeputies?: any[];
        result?: {
            desglose?: {
                yes?: Record<string, number>;
                no?: Record<string, number>;
                abstention?: Record<string, number>;
            };
        };
    };
    [key: string]: any;
}

export interface DashboardStats {
    globalSuccessRate: number;
    breakdown: {
        success: number;
        failure: number;
        neutral: number;
    };
    authorEfficiency: {
        gobierno: { total: number; success: number; rate: number };
        groups: { total: number; success: number; rate: number };
    };
}

export function calculateDashboardStats(initiatives: Initiative[]): DashboardStats {
    let finalizedCount = 0;

    // Breakdown buckets
    let successCount = 0;
    let failureCount = 0;
    let neutralCount = 0; // Abandon/Expire

    // Efficiency buckets
    const govStats = { total: 0, success: 0 };
    const groupStats = { total: 0, success: 0 };

    initiatives.forEach(init => {
        const status = init.resultado_tram || "";
        const author = init.autor || "";

        let isFinalized = false;
        let isSuccess = false;

        // Determine Status Category
        if (status.includes("Aprobado") || status.includes("Convalidado")) {
            successCount++;
            isFinalized = true;
            isSuccess = true;
        } else if (status.includes("Rechazado") || status.includes("Derogado")) {
            failureCount++;
            isFinalized = true;
        } else if (status.includes("Retirado") || status.includes("Decaído")) {
            neutralCount++;
            isFinalized = true;
        }
        // Exclude "En trámite", "Caducado" (unless mapped to neutral?), or unknowns from "Finalized" calculation for Global Rate

        if (isFinalized) {
            finalizedCount++;

            // Author Efficiency
            // Check if author is Government or a Group
            if (author.toLowerCase().includes("gobierno")) {
                govStats.total++;
                if (isSuccess) govStats.success++;
            } else {
                // Assuming everything else is a parliamentary group/initiative
                groupStats.total++;
                if (isSuccess) groupStats.success++;
            }
        }
    });

    // Calculate Rates
    const globalSuccessRate = finalizedCount > 0
        ? Math.round((successCount / finalizedCount) * 100)
        : 0;

    const govRate = govStats.total > 0
        ? Math.round((govStats.success / govStats.total) * 100)
        : 0;

    const groupRate = groupStats.total > 0
        ? Math.round((groupStats.success / groupStats.total) * 100)
        : 0;

    return {
        globalSuccessRate,
        breakdown: {
            success: successCount,
            failure: failureCount,
            neutral: neutralCount
        },
        authorEfficiency: {
            gobierno: { ...govStats, rate: govRate },
            groups: { ...groupStats, rate: groupRate }
        }
    };
}
