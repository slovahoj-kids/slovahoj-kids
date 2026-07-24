/**
 * Validator script for SlovAhoj Kids curriculum catalog
 * Validates 432 combinations: 3 ages x 12 months x 4 weeks x 3 lessons (and extends to 5 lessons)
 */
const fs = require('fs');
const path = require('path');

const AGES = ['junior', 'middle', 'senior'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const WEEKS = Array.from({ length: 4 }, (_, i) => i + 1);
const LESSONS = Array.from({ length: 5 }, (_, i) => i + 1); // 1..5 lessons

function validateCurriculumCatalog(curriculumCatalog) {
    const total432Keys = [];
    const missing432Keys = [];
    const valid432Keys = [];

    AGES.forEach(age => {
        MONTHS.forEach(m => {
            WEEKS.forEach(w => {
                [1, 2, 3].forEach(l => {
                    const key = `${age}-${m}-${w}-${l}`;
                    total432Keys.push(key);
                });
            });
        });
    });

    console.log(`=== STARTING CURRICULUM VALIDATION ===`);
    console.log(`Total 432 Standard Keys (3 ages x 12 months x 4 weeks x 3 lessons): ${total432Keys.length}`);

    let totalChecked = 0;
    let validCount = 0;
    let fallbackCount = 0;

    AGES.forEach(age => {
        MONTHS.forEach(m => {
            WEEKS.forEach(w => {
                LESSONS.forEach(l => {
                    totalChecked++;
                    const key = `${age}-${m}-${w}-${l}`;
                    
                    const monthData = curriculumCatalog[m];
                    const weekData = monthData && monthData.weeks ? monthData.weeks[w] : null;
                    const trackData = weekData && weekData.tracks ? weekData.tracks[age] : null;
                    const scenarioData = weekData && weekData.scenarios ? weekData.scenarios.find(s => s.id === l) : null;

                    const hasPhrase = trackData && trackData.phrase;
                    const hasTip = weekData && weekData.hint;
                    const hasScenario = scenarioData && scenarioData.title;

                    if (hasPhrase && hasTip && hasScenario) {
                        validCount++;
                        if (total432Keys.includes(key)) {
                            valid432Keys.push(key);
                        }
                    } else {
                        fallbackCount++;
                        if (total432Keys.includes(key)) {
                            missing432Keys.push(key);
                        }
                    }
                });
            });
        });
    });

    console.log(`\n=== VALIDATION RESULTS ===`);
    console.log(`Total combinations checked (up to 5 lessons): ${totalChecked}`);
    console.log(`Fully valid 432-scope combinations: ${valid432Keys.length} / 432 (${((valid432Keys.length / 432) * 100).toFixed(1)}%)`);
    console.log(`Missing 432-scope combinations requiring fallback: ${missing432Keys.length} / 432`);

    if (missing432Keys.length > 0) {
        console.log(`\nSample missing keys (first 10):`);
        missing432Keys.slice(0, 10).forEach(k => console.log(`  - ${k}`));
    }

    return {
        total432: total432Keys.length,
        valid432: valid432Keys.length,
        missing432: missing432Keys.length
    };
}

module.exports = { validateCurriculumCatalog, AGES, MONTHS, WEEKS, LESSONS };
