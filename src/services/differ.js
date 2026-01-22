export function compareSnapshots(oldText, newText) {
  const oldLines = oldText.split('\n').filter(l => l.trim());
  const newLines = newText.split('\n').filter(l => l.trim());

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter(line => !oldSet.has(line));
  const removed = oldLines.filter(line => !newSet.has(line));

  const changeRatio = (added.length + removed.length) / Math.max(oldLines.length, newLines.length, 1);

  return {
    added,
    removed,
    addedCount: added.length,
    removedCount: removed.length,
    totalOldLines: oldLines.length,
    totalNewLines: newLines.length,
    changeRatio,
    hasChanges: added.length > 0 || removed.length > 0
  };
}

export function generateChangeSummary(diff) {
  if (!diff.hasChanges) {
    return 'No changes detected.';
  }

  const parts = [];

  if (diff.addedCount > 0) {
    parts.push(`${diff.addedCount} line(s) added`);
  }
  if (diff.removedCount > 0) {
    parts.push(`${diff.removedCount} line(s) removed`);
  }

  const changePercent = (diff.changeRatio * 100).toFixed(1);
  parts.push(`(${changePercent}% change)`);

  return parts.join(', ');
}

export function determineSignificance(diff) {
  if (!diff.hasChanges) return 'none';

  if (diff.changeRatio > 0.3) return 'high';
  if (diff.changeRatio > 0.1) return 'medium';
  if (diff.addedCount + diff.removedCount > 20) return 'medium';

  return 'low';
}

export function formatDiffForAnalysis(diff, maxLines = 50) {
  const sections = [];

  if (diff.added.length > 0) {
    const addedSample = diff.added.slice(0, maxLines);
    sections.push('ADDED CONTENT:');
    sections.push(addedSample.map(l => `+ ${l}`).join('\n'));
    if (diff.added.length > maxLines) {
      sections.push(`... and ${diff.added.length - maxLines} more lines added`);
    }
  }

  if (diff.removed.length > 0) {
    const removedSample = diff.removed.slice(0, maxLines);
    sections.push('\nREMOVED CONTENT:');
    sections.push(removedSample.map(l => `- ${l}`).join('\n'));
    if (diff.removed.length > maxLines) {
      sections.push(`... and ${diff.removed.length - maxLines} more lines removed`);
    }
  }

  return sections.join('\n');
}
