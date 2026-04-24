const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

function getGitInfo() {
    try {
        const commit = execSync('git rev-parse --short HEAD').toString().trim();
        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
        const message = execSync('git log -1 --pretty=%B').toString().trim().split('\n')[0];
        return { commit, branch, message, provider: 'git' };
    } catch (e) {
        return { commit: 'unknown', branch: 'unknown', message: 'none', provider: 'none' };
    }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const gitInfo = getGitInfo();
const productCode = 'GS';
const publicVersion = packageJson.version || '1.0.0';
const now = new Date();
const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
const buildId = `${productCode}-${publicVersion}+${timestamp}.sha${gitInfo.commit}`;

const manifest = {
    product: { 
        name: "Ghost Scribe", 
        code: productCode, 
        public_version: publicVersion, 
        release_channel: "production" 
    },
    source: gitInfo,
    deployment: { 
        platform: "local", 
        environment: "production", 
        deployed_at: now.toISOString() 
    },
    build: { 
        build_id: buildId, 
        generated_at: now.toISOString() 
    }
};

const outputDir = path.join(__dirname, '../client/public');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✅ Generated GS manifest: ${buildId}`);
