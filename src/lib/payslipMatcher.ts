import { cleanCPF } from "@/lib/validators";

interface Collaborator {
  id: string;
  name: string;
  cpf: string;
}

interface MatchResult {
  collaboratorId: string | null;
  collaboratorName: string | null;
  confidence: "high" | "medium" | "low" | "none";
  matchType: "cpf" | "name" | "none";
}

// Normalize string for comparison (remove accents, lowercase, etc.)
const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// Extract potential CPF from filename
const extractCPF = (filename: string): string | null => {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  
  // Look for 11 consecutive digits (CPF without formatting)
  const cpfMatch = nameWithoutExt.match(/\d{11}/);
  if (cpfMatch) {
    return cpfMatch[0];
  }
  
  // Look for formatted CPF (XXX.XXX.XXX-XX)
  const formattedMatch = nameWithoutExt.match(/\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}/);
  if (formattedMatch) {
    return cleanCPF(formattedMatch[0]);
  }
  
  return null;
};

// Calculate string similarity (Levenshtein-based)
const stringSimilarity = (str1: string, str2: string): number => {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.9;
  }
  
  // Check word overlap
  const words1 = s1.split(" ").filter(w => w.length > 2);
  const words2 = s2.split(" ").filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matchCount = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        matchCount++;
        break;
      }
    }
  }
  
  const overlap = matchCount / Math.max(words1.length, words2.length);
  return overlap;
};

// Main matching function
export const matchFileToCollaborator = (
  filename: string,
  collaborators: Collaborator[]
): MatchResult => {
  if (collaborators.length === 0) {
    return { collaboratorId: null, collaboratorName: null, confidence: "none", matchType: "none" };
  }

  // Try CPF match first (highest confidence)
  const extractedCPF = extractCPF(filename);
  if (extractedCPF) {
    const cpfMatch = collaborators.find(c => cleanCPF(c.cpf) === extractedCPF);
    if (cpfMatch) {
      return {
        collaboratorId: cpfMatch.id,
        collaboratorName: cpfMatch.name,
        confidence: "high",
        matchType: "cpf",
      };
    }
  }

  // Try name matching
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  
  let bestMatch: Collaborator | null = null;
  let bestScore = 0;

  for (const collab of collaborators) {
    const similarity = stringSimilarity(nameWithoutExt, collab.name);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = collab;
    }
  }

  if (bestMatch && bestScore >= 0.7) {
    return {
      collaboratorId: bestMatch.id,
      collaboratorName: bestMatch.name,
      confidence: bestScore >= 0.9 ? "high" : "medium",
      matchType: "name",
    };
  }

  if (bestMatch && bestScore >= 0.4) {
    return {
      collaboratorId: bestMatch.id,
      collaboratorName: bestMatch.name,
      confidence: "low",
      matchType: "name",
    };
  }

  return { collaboratorId: null, collaboratorName: null, confidence: "none", matchType: "none" };
};

// Batch process files
export const processFilesForMatching = (
  files: File[],
  collaborators: Collaborator[]
): { file: File; match: MatchResult }[] => {
  return files.map(file => ({
    file,
    match: matchFileToCollaborator(file.name, collaborators),
  }));
};
