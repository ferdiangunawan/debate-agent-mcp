#!/usr/bin/env node
/**
 * Standalone test script to run debate review on fe-marketplace-react
 */

import { debateReview } from './dist/engine/debate.js';

const FE_MARKETPLACE_REACT_PATH = '/Users/ferdiangunawan/Documents/kick_avenue/repo/fe-marketplace-react';

async function main() {
  console.log('🚀 Starting debate review for fe-marketplace-react...\n');

  try {
    const result = await debateReview(
      'Review these code changes for potential bugs, code quality issues, and best practices. Focus on React patterns, error handling, and maintainability.',
      FE_MARKETPLACE_REACT_PATH
    );

    console.log('\n✅ Debate review completed!\n');
    console.log('='.repeat(80));
    console.log('WINNER:', result.winner.toUpperCase());
    console.log('='.repeat(80));

    console.log('\n📊 SCORES:');
    console.log(`Codex: ${result.evaluation.score_codex}`);
    console.log(`Claude: ${result.evaluation.score_claude}`);

    console.log('\n📝 EVALUATION REASON:');
    console.log(result.evaluation.reason);

    console.log('\n' + '='.repeat(80));
    console.log('CODEX OUTPUT:');
    console.log('='.repeat(80));
    console.log(result.codex_output);

    console.log('\n' + '='.repeat(80));
    console.log('CLAUDE OUTPUT:');
    console.log('='.repeat(80));
    console.log(result.claude_output);

    if (result.codex_critique) {
      console.log('\n' + '='.repeat(80));
      console.log('CODEX CRITIQUE OF CLAUDE:');
      console.log('='.repeat(80));
      console.log(result.codex_critique);
    }

    if (result.claude_critique) {
      console.log('\n' + '='.repeat(80));
      console.log('CLAUDE CRITIQUE OF CODEX:');
      console.log('='.repeat(80));
      console.log(result.claude_critique);
    }

    console.log('\n' + '='.repeat(80));
    console.log('FINAL MERGED RECOMMENDATION:');
    console.log('='.repeat(80));
    console.log(result.final_recommendation);

    console.log('\n✨ Review complete!');
  } catch (error) {
    console.error('❌ Error running debate review:', error.message);
    process.exit(1);
  }
}

main();
