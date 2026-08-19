module.exports = (estimatedCostUsd, thresholds) => {
  const amount = Number(estimatedCostUsd);
  const sorted = [...(thresholds || [])].sort((a, b) => Number(a.minValueUsd) - Number(b.minValueUsd));

  const match = sorted.find((t) => {
    const min = t.minValueUsd === null || t.minValueUsd === undefined ? null : Number(t.minValueUsd);
    const max = t.maxValueUsd === null || t.maxValueUsd === undefined ? null : Number(t.maxValueUsd);
    if (min === null && max === null) return true;
    if (min === null) return amount <= max;
    if (max === null) return amount >= min;
    return amount >= min && amount <= max;
  });

  return match ? match.band : "D";
};
