// Helper function to convert entries to markdown
export function entriesToMarkdown(entries, type) {
  if (!entries?.length) return "";

  return (
    `## ${type}\n\n` +
    entries
      .map((entry) => {
        const dateRange = entry.current
          ? `${entry.startDate} - Present`
          : `${entry.startDate} - ${entry.endDate}`;
        
        // Handle case where organization might be empty
        const titleLine = entry.organization 
          ? `### ${entry.title} @ ${entry.organization}` 
          : `### ${entry.title}`;
          
        return `${titleLine}\n${dateRange}\n\n${entry.description || ''}`;
      })
      .join("\n\n")
  );
}
