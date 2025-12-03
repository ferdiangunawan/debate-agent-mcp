/**
 * Debate Agent MCP - VS Code Extension
 * 
 * Automatically configures the Debate Agent MCP server in VS Code settings
 * for use with GitHub Copilot, Cline, Continue, and other MCP-compatible tools.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[Debate Agent MCP] Extension activating...');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(comment-discussion) Debate Agent';
    statusBarItem.tooltip = 'Debate Agent MCP - Click for status';
    statusBarItem.command = 'debateAgent.showStatus';
    context.subscriptions.push(statusBarItem);

    // Path to bundled MCP server
    const serverPath = path.join(context.extensionPath, 'dist', 'mcp-server.js');

    // Check if auto-configure is enabled
    const config = vscode.workspace.getConfiguration('debateAgent');
    const autoConfigureMcp = config.get<boolean>('autoConfigureMcp', true);

    if (autoConfigureMcp) {
        try {
            await configureMcpServer(serverPath);
            statusBarItem.text = '$(check) Debate Agent';
            statusBarItem.backgroundColor = undefined;
            vscode.window.showInformationMessage(
                'Debate Agent MCP configured! Use @mcp in Copilot Chat to access debate tools.'
            );
        } catch (error) {
            statusBarItem.text = '$(warning) Debate Agent';
            statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
            console.error('[Debate Agent MCP] Configuration failed:', error);
        }
    }

    statusBarItem.show();

    // Register commands
    const configureCommand = vscode.commands.registerCommand(
        'debateAgent.configure',
        async () => {
            try {
                await configureMcpServer(serverPath);
                vscode.window.showInformationMessage(
                    'Debate Agent MCP configured successfully!'
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to configure MCP: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );

    const showStatusCommand = vscode.commands.registerCommand(
        'debateAgent.showStatus',
        async () => {
            const serverExists = fs.existsSync(serverPath);
            const mcpConfig = await getMcpConfig();

            const status = [
                `**Debate Agent MCP Status**`,
                ``,
                `Server bundled: ${serverExists ? '✅ Yes' : '❌ No'}`,
                `Server path: \`${serverPath}\``,
                `MCP configured: ${mcpConfig ? '✅ Yes' : '❌ No'}`,
                ``,
                `**Available Tools:**`,
                `- \`list_agents\` - List configured agents`,
                `- \`read_diff\` - Read git diff`,
                `- \`run_agent\` - Run single agent`,
                `- \`debate_review\` - Multi-agent code review`,
                `- \`debate_plan\` - Create debate plan`,
            ].join('\n');

            const panel = vscode.window.createWebviewPanel(
                'debateAgentStatus',
                'Debate Agent MCP Status',
                vscode.ViewColumn.One,
                {}
            );

            panel.webview.html = getWebviewContent(status);
        }
    );

    context.subscriptions.push(configureCommand, showStatusCommand);

    console.log('[Debate Agent MCP] Extension activated');
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    console.log('[Debate Agent MCP] Extension deactivated');
}

/**
 * Configure MCP server in VS Code settings
 */
async function configureMcpServer(serverPath: string): Promise<void> {
    const mcpConfig = {
        'debate-agent': {
            command: 'node',
            args: [serverPath],
        },
    };

    // Update VS Code settings
    const config = vscode.workspace.getConfiguration();

    // Try different MCP settings locations
    const mcpSettingsKeys = ['mcp.servers', 'mcpServers'];

    for (const key of mcpSettingsKeys) {
        try {
            const existingServers = config.get<Record<string, unknown>>(key) || {};
            await config.update(
                key,
                { ...existingServers, ...mcpConfig },
                vscode.ConfigurationTarget.Global
            );
            console.log(`[Debate Agent MCP] Configured in ${key}`);
        } catch {
            // Setting might not exist, try next one
        }
    }

    // Also write to mcp.json if it exists or in common locations
    const mcpJsonPaths = [
        path.join(os.homedir(), '.vscode', 'mcp.json'),
        path.join(os.homedir(), '.cursor', 'mcp.json'),
    ];

    for (const mcpJsonPath of mcpJsonPaths) {
        try {
            const dir = path.dirname(mcpJsonPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            let mcpJson: Record<string, unknown> = {};
            if (fs.existsSync(mcpJsonPath)) {
                mcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
            }

            mcpJson.mcpServers = {
                ...(mcpJson.mcpServers as Record<string, unknown> || {}),
                ...mcpConfig,
            };

            fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2));
            console.log(`[Debate Agent MCP] Wrote to ${mcpJsonPath}`);
        } catch (error) {
            // Might not have permissions, continue
            console.error(`[Debate Agent MCP] Failed to write ${mcpJsonPath}:`, error);
        }
    }
}

/**
 * Get current MCP configuration
 */
async function getMcpConfig(): Promise<Record<string, unknown> | null> {
    const config = vscode.workspace.getConfiguration();

    const mcpServers = config.get<Record<string, unknown>>('mcp.servers');
    if (mcpServers && mcpServers['debate-agent']) {
        return mcpServers['debate-agent'] as Record<string, unknown>;
    }

    const mcpServersAlt = config.get<Record<string, unknown>>('mcpServers');
    if (mcpServersAlt && mcpServersAlt['debate-agent']) {
        return mcpServersAlt['debate-agent'] as Record<string, unknown>;
    }

    return null;
}

/**
 * Generate webview content for status panel
 */
function getWebviewContent(markdown: string): string {
    // Simple markdown to HTML conversion
    const html = markdown
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^- (.*)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Debate Agent MCP Status</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    code {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
    li {
      margin: 5px 0;
    }
    ul {
      list-style-type: none;
      padding-left: 0;
    }
    li::before {
      content: "• ";
      color: var(--vscode-textLink-foreground);
    }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`;
}
