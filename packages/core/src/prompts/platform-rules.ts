/**
 * Platform-specific scrutiny rules for code review
 */

import type { Platform } from "../types.js";

const FLUTTER_RULES = `### Flutter
- Async misuse, rebuild loops, setState misuse, state desync
- Isolates, platform channels, flavor configs, build modes
- Missing \`dispose()\`, \`mounted\` checks, \`BuildContext\` in async gaps
- Provider/Riverpod state management issues
- Widget tree depth and performance concerns
- Memory leaks from stream subscriptions`;

const ANDROID_RULES = `### Android
- Manifest issues, runtime permissions, FCM config
- ProGuard rules, ABI splits, Gradle config
- versionCode/versionName inconsistencies
- Activity/Fragment lifecycle violations
- Memory leaks from context references
- Background task and WorkManager issues`;

const IOS_RULES = `### iOS
- plist errors, ATS config, keychain usage
- UNNotificationServiceExtension issues
- Provisioning/signing problems, thread/queue misuse
- Memory management and retain cycles
- Main thread UI violations
- Background fetch and push notification handling`;

const BACKEND_RULES = `### Backend/API
- DTO mismatch, null-handling gaps
- Incorrect HTTP codes, concurrency issues
- Pagination leaks, missing error handling
- SQL injection, authentication/authorization flaws
- Rate limiting gaps, missing input validation
- Transaction handling and database connection leaks`;

const GENERAL_RULES = `### General
- Null pointer dereferences and undefined behavior
- Resource leaks (file handles, connections, memory)
- Race conditions and thread safety issues
- Error handling gaps and silent failures
- Security vulnerabilities (injection, XSS, CSRF)
- Missing input validation and boundary checks`;

const PLATFORM_RULES: Record<Platform, string> = {
    flutter: FLUTTER_RULES,
    android: ANDROID_RULES,
    ios: IOS_RULES,
    backend: BACKEND_RULES,
    general: GENERAL_RULES,
};

export function getPlatformRules(platform: Platform): string {
    return PLATFORM_RULES[platform] || GENERAL_RULES;
}

export function getAllPlatformRules(): string {
    return Object.values(PLATFORM_RULES).join("\n\n");
}
