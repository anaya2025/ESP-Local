import { GeneratedFile } from '../types';

export interface GitHubPublishOptions {
  token: string;
  repoName: string;
  description: string;
  isPrivate: boolean;
  onProgress?: (msg: string) => void;
}

export interface PublishResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Creates a new GitHub repository and commits all generated files via GitHub REST API.
 */
export async function publishToGitHub(
  files: GeneratedFile[],
  options: GitHubPublishOptions
): Promise<PublishResult> {
  const { token, repoName, description, isPrivate, onProgress } = options;

  try {
    onProgress?.('Verifying GitHub token & user profile...');
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!userRes.ok) {
      const err = await userRes.json().catch(() => ({}));
      return { success: false, error: `Invalid GitHub token: ${err.message || userRes.statusText}` };
    }

    const userData = await userRes.json();
    const username = userData.login;

    onProgress?.(`Creating repository "${repoName}" on GitHub...`);
    const createRepoRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        name: repoName,
        description: description || 'ESP32-S3 N16R8 Firmware Project',
        private: isPrivate,
        auto_init: true // Creates an initial main branch commit
      })
    });

    let repoUrl = `https://github.com/${username}/${repoName}`;

    if (!createRepoRes.ok) {
      const err = await createRepoRes.json().catch(() => ({}));
      // If repo already exists, check if user has access
      if (err.message && err.message.includes('already exists')) {
        onProgress?.(`Repository "${repoName}" already exists. Committing files to it...`);
      } else {
        return { success: false, error: `Failed to create repo: ${err.message || createRepoRes.statusText}` };
      }
    } else {
      const repoData = await createRepoRes.json();
      repoUrl = repoData.html_url || repoUrl;
    }

    // Wait 1.5 seconds for GitHub initialization if new repo
    await new Promise(r => setTimeout(r, 1500));

    // Upload/Update each file sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(`Committing file ${i + 1}/${files.length}: ${file.path}...`);

      // Check if file already exists to get sha
      let sha: string | undefined = undefined;
      try {
        const checkRes = await fetch(
          `https://api.github.com/repos/${username}/${repoName}/contents/${encodeURIComponent(file.path).replace(/%2F/g, '/')}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json'
            }
          }
        );
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          sha = checkData.sha;
        }
      } catch (e) {
        // file doesn't exist yet, ok
      }

      // Convert content to Base64 (UTF-8 safe)
      const utf8Bytes = new TextEncoder().encode(file.content);
      let binaryStr = '';
      for (let b = 0; b < utf8Bytes.length; b++) {
        binaryStr += String.fromCharCode(utf8Bytes[b]);
      }
      const base64Content = btoa(binaryStr);

      const putRes = await fetch(
        `https://api.github.com/repos/${username}/${repoName}/contents/${encodeURIComponent(file.path).replace(/%2F/g, '/')}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `chore: add ${file.path} for ESP32-S3 N16R8`,
            content: base64Content,
            ...(sha ? { sha } : {})
          })
        }
      );

      if (!putRes.ok) {
        const putErr = await putRes.json().catch(() => ({}));
        console.warn(`Failed to commit ${file.path}:`, putErr);
      }
    }

    onProgress?.('Repository created and files committed successfully!');
    return { success: true, url: repoUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown network error' };
  }
}
