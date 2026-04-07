/**
 * Ghost Lens AI Help Generator
 * Analyzes page screenshots with vision AI to auto-generate contextual help
 */

const DEFAULT_API_ENDPOINT = 'http://localhost:11434'; // Ollama
const FALLBACK_API = 'https://api.anthropic.com'; // Claude fallback

/**
 * Capture page screenshot as base64
 */
export async function captureScreenshot() {
  try {
    // Try to use html2canvas if available
    const html2canvas = window.html2canvas || (await import('html2canvas')).default;
    
    if (html2canvas) {
      const canvas = await html2canvas(document.body, {
        backgroundColor: null,
        scale: 1,
        logging: false,
      });
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]; // base64
    }
  } catch (e) {
    console.warn('html2canvas unavailable:', e);
  }
  
  // Fallback: use canvas API
  return await canvasScreenshot();
}

/**
 * Fallback screenshot using Canvas API
 */
async function canvasScreenshot() {
  const canvas = await new Promise((resolve) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.font = '16px monospace';
    ctx.fillText('Screenshot API unavailable', 20, 30);
    resolve(c);
  });
  
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}

/**
 * Analyze screenshot with vision AI (Ollama llava)
 */
export async function analyzeWithOllama(base64Image) {
  try {
    const response = await fetch(`${DEFAULT_API_ENDPOINT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llava:13b',  // Using 13b to avoid OOM with 34b
        prompt: `Analyze this UI screenshot and provide help information.
        
Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "sections": [
    {
      "title": "Section name",
      "description": "What this section does",
      "elements": [
        {
          "selector": "css selector or describe location",
          "label": "Element name",
          "help": "What it does and why it matters",
          "type": "button|input|section|link|etc"
        }
      ]
    }
  ],
  "overview": "Brief explanation of the overall purpose of this interface"
}

Be concise. Focus on interactive elements. If you can't identify elements precisely, use descriptive locations like "top-left button" or "form in center".`,
        images: [base64Image],
        stream: false,
      }),
    });

    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
    const data = await response.json();
    
    // Parse JSON from response
    const jsonMatch = data.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Ollama analysis failed:', err);
    return null;
  }
}

/**
 * Fallback: Analyze with Claude API
 */
export async function analyzeWithClaude(base64Image, apiKey) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `Analyze this UI screenshot and provide help information.
        
Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "sections": [
    {
      "title": "Section name",
      "description": "What this section does",
      "elements": [
        {
          "selector": "css selector or describe location",
          "label": "Element name",
          "help": "What it does and why it matters",
          "type": "button|input|section|link|etc"
        }
      ]
    }
  ],
  "overview": "Brief explanation of the overall purpose of this interface"
}

Be concise. Focus on interactive elements.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
    const data = await response.json();
    
    const content = data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Claude analysis failed:', err);
    return null;
  }
}

/**
 * Generate help with fallback chain
 */
export async function generateHelp(claudeApiKey = null) {
  try {
    console.log('[Ghost Lens AI] Starting help generation...');
    const screenshot = await captureScreenshot();
    console.log('[Ghost Lens AI] Screenshot captured:', screenshot ? screenshot.slice(0, 50) + '...' : 'FAILED');
    
    // Try Ollama first
    console.log('[Ghost Lens AI] Attempting Ollama analysis...');
    let help = await analyzeWithOllama(screenshot);
    if (help) {
      console.log('[Ghost Lens AI] Ollama analysis successful!', help);
      return help;
    }
    
    console.warn('[Ghost Lens AI] Ollama failed, trying Claude...');
    
    // Fall back to Claude if provided
    if (claudeApiKey) {
      help = await analyzeWithClaude(screenshot, claudeApiKey);
      if (help) {
        console.log('[Ghost Lens AI] Claude analysis successful!', help);
        return help;
      }
    }
    
    console.warn('[Ghost Lens AI] All AI providers failed');
    return null;
  } catch (err) {
    console.error('[Ghost Lens AI] Help generation error:', err);
    return null;
  }
}

/**
 * Find element on page and return bounding box
 */
export function locateElement(selector) {
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Convert AI help into renderable format with positions
 */
export function enrichHelpWithPositions(helpData) {
  if (!helpData || !helpData.sections) return [];
  
  const enriched = [];
  
  helpData.sections.forEach((section, sectionIdx) => {
    const sectionCard = {
      type: 'section',
      index: sectionIdx,
      title: section.title,
      description: section.description,
      elements: [],
    };
    
    section.elements?.forEach((elem, elemIdx) => {
      const position = locateElement(elem.selector);
      
      enriched.push({
        type: 'element',
        index: sectionIdx * 100 + elemIdx,
        sectionIdx,
        elemIdx,
        label: elem.label,
        help: elem.help,
        elementType: elem.type,
        selector: elem.selector,
        position, // null if not found on page
      });
    });
  });
  
  return enriched;
}
