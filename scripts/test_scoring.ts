import { calculateScoreForIndicator } from '../src/lib/qualitative/scoring'

const testData = {
    'sea_score_1_wie_hoch_schaetzt_ihr_euren_ak': { option: '76-100%' },
    'sea_score_1_wird_ein_saisonkalender_genutz': { option: 'Ja' },
    'sea_score_1_ist_der_speiseplan_grundsaetzl': { option: 'Ja' },
    'sea_score_1_arbeitet_ihr_mit_einzelnen_wec': { option: 'Ja' },
    'sea_score_1_wird_der_speiseplan_regelmaess': { option: 'Geplant' }
};

const score = calculateScoreForIndicator(testData as any, 'seasonal');
console.log("Calculated Score:", score);
