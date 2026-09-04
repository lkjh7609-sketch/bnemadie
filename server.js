import Fastify from 'fastify'
import cors from '@fastify/cors'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { getGame } from 'kbo-game'

dotenv.config()

const fastify = Fastify({
  logger: {
    level: 'info',
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        hostname: req.hostname,
        remoteAddress: req.ip
      }),
      res: (res) => ({
        statusCode: res.statusCode
      })
    }
  }
})

await fastify.register(cors, {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'tauri://localhost',
    'https://tauri.localhost',
    /\.vercel\.app$/,
    /\.netlify\.app$/,
    /\.ggm\.kr$/
  ],
  credentials: true
})

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'

// Custom Anthropic API call function
async function callAnthropicAPI(messages, systemPrompt, maxTokens = 2000) {
  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANTHROPIC_API_KEY}`,
      'anthropic-version': '2023-06-01',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      messages: messages,
      system: `${systemPrompt}${PHARMACEUTICAL_TERMINOLOGY_PROMPT}`
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`)
  }

  return await response.json()
}

// In-memory user storage (replace with database in production)
const users = new Map()
const apiKeys = new Map()

function generateApiKey() {
  return 'sk_' + crypto.randomBytes(32).toString('hex')
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

fastify.addHook('onRequest', async (request, reply) => {
  const publicRoutes = ['/health', '/api/auth/register', '/api/auth/login', '/api/auth/verify']

  if (publicRoutes.includes(request.url) || request.url.startsWith('/api/email') || request.url.startsWith('/api/sports') || request.url.startsWith('/api/terms')) {
    return
  }

  const apiKey = request.headers['x-api-key']

  if (!apiKey || !apiKeys.has(apiKey)) {
    reply.code(401).send({ error: 'Unauthorized' })
    return
  }

  request.user = apiKeys.get(apiKey)
})

fastify.post('/api/terms/suggest', async (request, reply) => {
  try {
    const { term, context = '' } = request.body || {}
    if (!term || typeof term !== 'string' || term.length > 120) return reply.code(400).send({ error: 'Invalid term' })
    const prompt = `Suggest up to four alternative professional terms for the selected word in a pharmaceutical, clinical, regulatory, quality, or manufacturing business context. Use established industry terminology rather than literal translation. Preserve the meaning of the original word and do not force a technical term if the context does not support it. Return only valid JSON: {"suggestions":[{"term":"...","explanation":"..."}]}. Explanations must be in Korean. Do not provide legal or medical conclusions.\n\nSelected word: ${term}\nContext: ${String(context).slice(0, 500)}`
    const response = await callAnthropicAPI([{ role: 'user', content: prompt }], ENHANCED_SYSTEM_PROMPT, 900)
    const parsed = parseJsonResponse(response.content?.[0]?.text || '', { suggestions: [] })
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((item) => item && typeof item.term === 'string').slice(0, 4) : []
    return reply.send({ term, suggestions })
  } catch (error) {
    request.log.error({ err: error }, 'Error suggesting professional terms')
    return reply.code(500).send({ error: 'Failed to suggest professional terms' })
  }
})

// Auth endpoints
fastify.post('/api/auth/register', async (request, reply) => {
  try {
    const { email, password } = request.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required' })
    }

    if (password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' })
    }

    if (users.has(email)) {
      return reply.code(400).send({ error: 'User already exists' })
    }

    const apiKey = generateApiKey()
    const user = {
      email,
      passwordHash: hashPassword(password),
      apiKey,
      createdAt: new Date().toISOString()
    }

    users.set(email, user)
    apiKeys.set(apiKey, user)

    return reply.send({ apiKey })
  } catch (error) {
    request.log.error({ err: error }, 'Registration error')
    return reply.code(500).send({ error: 'Registration failed' })
  }
})

fastify.post('/api/auth/login', async (request, reply) => {
  try {
    const { email, password } = request.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required' })
    }

    const user = users.get(email)

    if (!user || user.passwordHash !== hashPassword(password)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    return reply.send({ apiKey: user.apiKey })
  } catch (error) {
    request.log.error({ err: error }, 'Login error')
    return reply.code(500).send({ error: 'Login failed' })
  }
})

fastify.post('/api/auth/verify', async (request, reply) => {
  try {
    const apiKey = request.headers['x-api-key']

    if (!apiKey || !apiKeys.has(apiKey)) {
      return reply.code(401).send({ error: 'Invalid API key' })
    }

    const user = apiKeys.get(apiKey)
    return reply.send({ email: user.email })
  } catch (error) {
    request.log.error({ err: error }, 'Verification error')
    return reply.code(500).send({ error: 'Verification failed' })
  }
})

const ENHANCED_SYSTEM_PROMPT = `You are an expert business communication assistant with deep understanding of professional email writing in both Korean and English.

Core Principles:
1. Context Understanding: Before generating any email, analyze the situation, relationship dynamics, cultural context, and business implications.
2. Natural Communication: Produce emails that sound natural and appropriate for the cultural and business context, not mechanical translations.
3. Appropriate Tone: Match the tone to the relationship (superior/peer/subordinate/client/vendor) and situation (request/apology/update/complaint).
4. Factual Accuracy: Never invent information. Use neutral wording when details are missing.
5. Conciseness: Be clear and professional without unnecessary verbosity.
6. Cultural Awareness: Korean business emails often use more formal honorifics and indirect language. English business emails are typically more direct but still polite.
7. Default Language: Unless the user explicitly requests another language, write the email and all explanations in Korean.`

const PHARMACEUTICAL_TERMINOLOGY_PROMPT = `
Pharmaceutical and regulatory terminology rules for email-related outputs:
- When the context is pharmaceutical, clinical, regulatory, quality, manufacturing, or medical, use terminology used by MFDS, the Ministry of Government Legislation, and pharmaceutical companies rather than literal translations.
- Prefer established terms such as protocol (시험계획서/프로토콜 when appropriate), clinical trial, investigational product, active pharmaceutical ingredient (API), finished product, specification, stability study, validation, deviation, change control, CAPA, quality assurance (QA), quality control (QC), batch/lot, release testing, and certificate of analysis (CoA) when the context supports them.
- Do not mechanically replace every word: choose the term that matches the source context and never change the legal or scientific meaning.
- If an original email is supplied, preserve its established professional and regulatory terms as much as possible. Correct grammar and tone around them, but do not replace a valid technical term with a casual or literal synonym.
- Do not invent regulatory conclusions, approvals, study results, or commitments. Terminology reference is not legal or medical advice.
`

const MAX_INPUT_LENGTH = 10000
const LANGUAGE_NAMES = {
  korean: 'Korean',
  english: 'English',
  japanese: 'Japanese',
  chinese: 'Chinese'
}

function languageName(language) {
  return LANGUAGE_NAMES[language] || language || 'Korean'
}

function recipientDetailsPrompt(details = {}) {
  const entries = [
    ['Recipient name', details.recipientName],
    ['Recipient company', details.recipientCompany],
    ['Recipient role', details.recipientRole]
  ].filter(([, value]) => typeof value === 'string' && value.trim())

  return entries.length
    ? `\nOptional recipient details (use only when provided; never invent missing details):\n${entries.map(([label, value]) => `${label}: ${value.trim()}`).join('\n')}\n`
    : ''
}

function parseJsonResponse(responseText, fallback) {
  try {
    return JSON.parse(responseText)
  } catch (error) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch (nestedError) {
        // Fall through to the caller-provided fallback.
      }
    }

    return fallback
  }
}

fastify.post('/api/email/smart-generate', async (request, reply) => {
  try {
    const { userInput, input, inputLang = 'korean', outputLang = 'korean', recipientDetails } = request.body || {}
    const rawInput = typeof userInput === 'string' ? userInput : input

    if (!rawInput || typeof rawInput !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (rawInput.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    // Stage 1: infer the situation and create a first draft without requiring
    // the caller to choose language, tone, or email length.
    const targetLanguage = languageName(outputLang)
    const draftPrompt = `Analyze the user's request and create a professional business email draft in ${targetLanguage}.
The user's input language is ${languageName(inputLang)} and the requested output language is ${targetLanguage}.
Infer the relationship, tone, and length from the context. Write the subject and body in ${targetLanguage},
and write reasoning and metadata in Korean.
Do not invent names, dates, facts, or commitments that are not present in the input.

User request:
${rawInput}
${recipientDetailsPrompt(recipientDetails)}

Return only valid JSON with these fields:
- "subject": email subject
- "content": complete email body
- "detectedLanguage": the output language
- "tone": the selected business tone
- "reasoning": brief explanation of the inferred context in Korean`

    const draftResponse = await callAnthropicAPI(
      [{ role: 'user', content: draftPrompt }],
      ENHANCED_SYSTEM_PROMPT,
      2500
    )

    const draftText = draftResponse.content?.[0]?.text || ''
    const draft = parseJsonResponse(draftText, {
      subject: '',
      content: draftText,
      detectedLanguage: targetLanguage,
      tone: '전문적',
      reasoning: '구조화된 메타데이터 없이 초안이 생성되었습니다.'
    })

    // Stage 2: independently review the draft and return the corrected final
    // version together with actionable quality feedback.
    const reviewPrompt = `Review the following AI-generated business email against the user's original request.
Check factual faithfulness, clarity, grammar, cultural appropriateness, relationship-appropriate politeness,
professional tone, unnecessary wording, and whether the requested purpose is clear.
Fix every issue you find and return the final usable email in ${targetLanguage}. Preserve facts and do not add unsupported details.
If the final email is not Korean, also provide a faithful Korean translation of the complete email body.

Original user request:
${rawInput}

Draft:
${JSON.stringify(draft)}

Return only valid JSON with these fields:
- "subject": final email subject
- "content": final corrected email body
- "detectedLanguage": final output language
- "tone": final tone
- "koreanTranslation": Korean translation of the complete body, or null when the output is Korean
- "businessAppropriate": boolean indicating whether the final email is suitable for business use
- "score": integer from 0 to 100
- "strengths": array of short positive observations
- "issuesFound": array of issues that were corrected, or an empty array
- "reviewSummary": short explanation of the final review`

    const reviewResponse = await callAnthropicAPI(
      [{ role: 'user', content: reviewPrompt }],
      ENHANCED_SYSTEM_PROMPT,
      3000
    )

    const reviewText = reviewResponse.content?.[0]?.text || ''
    const result = parseJsonResponse(reviewText, {
      subject: draft.subject || '',
      content: draft.content || reviewText,
      detectedLanguage: draft.detectedLanguage || targetLanguage,
      tone: draft.tone || '전문적',
      koreanTranslation: null,
      businessAppropriate: true,
      score: null,
      strengths: [],
      issuesFound: [],
      reviewSummary: '최종 검토 응답을 구조화된 JSON으로 변환하지 못했습니다.'
    })

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error in smart email generation')
    return reply.code(500).send({ error: 'Failed to smart-generate email' })
  }
})

fastify.post('/api/email/generate', async (request, reply) => {
  try {
    const { input, inputLang, outputLang, tone, length, recipientDetails } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    let userPrompt = `User Input:\n${input}\n\n${recipientDetailsPrompt(recipientDetails)}`

    if (inputLang && inputLang !== 'auto') {
      userPrompt += `Input Language: ${inputLang}\n`
    }

    if (outputLang && outputLang !== 'auto') {
      userPrompt += `Output Language: ${outputLang}\n`
    }

    if (tone && tone !== 'auto') {
      userPrompt += `Tone: ${tone}\n`
    }

    if (length) {
      userPrompt += `Length: ${length}\n`
    }

    userPrompt += `\nPlease generate an appropriate professional email. The subject and content must be in ${languageName(outputLang)}. If the output is not Korean, also return a faithful Korean translation of the complete email body. Return only valid JSON with "subject", "content", and "koreanTranslation" fields. Set "koreanTranslation" to null when the content is Korean.`

    const apiResponse = await callAnthropicAPI(
      [{ role: 'user', content: userPrompt }],
      ENHANCED_SYSTEM_PROMPT
    )

    const responseText = apiResponse.content[0].text
    let result

    try {
      result = JSON.parse(responseText)
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = {
          subject: '',
          content: responseText,
          koreanTranslation: null
        }
      }
    }

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error generating email')
    return reply.code(500).send({ error: 'Failed to generate email' })
  }
})

fastify.post('/api/email/reply', async (request, reply) => {
  try {
    const { input, outputLang, tone, length, recipientDetails } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    let userPrompt = `The user wants to reply to the following email. Analyze the email and generate an appropriate reply in Korean.\n\nOriginal Email and User's Instructions:\n${input}\n\n${recipientDetailsPrompt(recipientDetails)}`

    if (outputLang && outputLang !== 'auto') {
      userPrompt += `Reply Language: ${outputLang}\n`
    }

    if (tone && tone !== 'auto') {
      userPrompt += `Tone: ${tone}\n`
    }

    if (length) {
      userPrompt += `Length: ${length}\n`
    }

    userPrompt += `\nGenerate a professional reply email. The subject and content must be in ${languageName(outputLang || 'korean')}. If the output is not Korean, also return a faithful Korean translation of the complete email body. Return only valid JSON with "subject", "content", and "koreanTranslation" fields. Set "koreanTranslation" to null when the content is Korean.`

    const apiResponse = await callAnthropicAPI(
      [{ role: 'user', content: userPrompt }],
      ENHANCED_SYSTEM_PROMPT
    )

    const responseText = apiResponse.content[0].text
    let result

    try {
      result = JSON.parse(responseText)
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = {
          subject: '',
          content: responseText,
          koreanTranslation: null
        }
      }
    }

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error generating reply')
    return reply.code(500).send({ error: 'Failed to generate reply' })
  }
})

fastify.post('/api/email/grammar', async (request, reply) => {
  try {
    const { input, outputLang = 'korean' } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const targetLanguage = languageName(outputLang)
    const userPrompt = `Check and improve the grammar, spelling, and style of the following email. Make it sound natural and professional for business communication. Keep the original text unchanged, but write the improved version and all explanations in ${targetLanguage}.\n\nOriginal Email:\n${input}\n\nReturn only valid JSON with these fields:\n- "original": the original text\n- "improved": the corrected version in ${targetLanguage}\n- "changes": an array of objects with "before", "after", and "explanation" in ${targetLanguage} for each significant change`

    const apiResponse = await callAnthropicAPI(
      [{ role: 'user', content: userPrompt }],
      ENHANCED_SYSTEM_PROMPT,
      2500
    )

    const responseText = apiResponse.content[0].text
    let result

    try {
      result = JSON.parse(responseText)
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = {
          original: input,
          improved: responseText,
          changes: []
        }
      }
    }

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error checking grammar')
    return reply.code(500).send({ error: 'Failed to check grammar' })
  }
})

fastify.post('/api/email/summarize', async (request, reply) => {
  try {
    const { input, outputLang = 'korean' } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const targetLanguage = languageName(outputLang)
    const userPrompt = `Analyze and summarize the following email. Extract key information. Write all generated text in ${targetLanguage}.\n\nEmail:\n${input}\n\nReturn only valid JSON with these fields:\n- "summary": brief summary of the email in ${targetLanguage}\n- "keyPoints": array of main points in ${targetLanguage}\n- "actionItems": array of action items or requests in ${targetLanguage}\n- "deadline": deadline if mentioned (or null)\n- "tone": the tone of the email, described in ${targetLanguage}`

    const apiResponse = await callAnthropicAPI(
      [{ role: 'user', content: userPrompt }],
      ENHANCED_SYSTEM_PROMPT
    )

    const responseText = apiResponse.content[0].text
    let result

    try {
      result = JSON.parse(responseText)
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = {
          summary: responseText,
          keyPoints: [],
          actionItems: [],
          deadline: null,
          tone: 'Unknown'
        }
      }
    }

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error summarizing email')
    return reply.code(500).send({ error: 'Failed to summarize email' })
  }
})

fastify.post('/api/email/regenerate', async (request, reply) => {
  try {
    const { content, tone, outputLang = 'korean', recipientDetails } = request.body

    if (!content || typeof content !== 'string') {
      return reply.code(400).send({ error: 'Invalid content' })
    }

    if (content.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Content too long' })
    }

    const targetLanguage = languageName(outputLang)
    const userPrompt = `Please rewrite the following email with a ${tone} tone. Keep the core message the same but adjust the tone appropriately. Write the rewritten subject and content in ${targetLanguage}. If the output is not Korean, also return a faithful Korean translation of the complete email body.\n\nOriginal Email:\n${content}\n\n${recipientDetailsPrompt(recipientDetails)}Return only valid JSON with "subject", "content", and "koreanTranslation" fields. Set "koreanTranslation" to null when the content is Korean.`

    const apiResponse = await callAnthropicAPI(
      [{ role: 'user', content: userPrompt }],
      ENHANCED_SYSTEM_PROMPT
    )

    const responseText = apiResponse.content[0].text
    let result

    try {
      result = JSON.parse(responseText)
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = {
          subject: '',
          content: responseText,
          koreanTranslation: null
        }
      }
    }

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error regenerating email')
    return reply.code(500).send({ error: 'Failed to regenerate email' })
  }
})

fastify.post('/api/email/auto-detect', async (request, reply) => {
  try {
    const { input, outputLang = 'korean' } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const userPrompt = `Analyze the following user input and determine what they want to do with email. Detect the task type, input language, and suggest an appropriate tone. Write detectedLanguage, suggestedTone, and reasoning in Korean.\n\nUser Input:\n${input}\n\nReturn only valid JSON with these fields:\n- "taskType": one of "generate", "reply", "grammar", "summarize"\n- "detectedLanguage": detected language of input in Korean\n- "suggestedTone": recommended tone in Korean\n- "confidence": confidence level 0-1\n- "reasoning": brief explanation of the detection in Korean`

    const apiResponse = await callAnthropicAPI(
      [{ role: 'user', content: userPrompt }],
      ENHANCED_SYSTEM_PROMPT,
      1500
    )

    const responseText = apiResponse.content[0].text
    let result

    try {
      result = JSON.parse(responseText)
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = {
          taskType: 'generate',
          detectedLanguage: '알 수 없음',
          suggestedTone: '전문적',
          confidence: 0.5,
          reasoning: '응답을 분석하지 못했습니다.'
        }
      }
    }

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error auto-detecting task')
    return reply.code(500).send({ error: 'Failed to auto-detect task' })
  }
})

fastify.post('/api/email/analyze', async (request, reply) => {
  try {
    const { input, outputLang = 'korean' } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const targetLanguage = languageName(outputLang)
    const userPrompt = `Perform a deep structural analysis of the following email context. Analyze relationship dynamics, urgency, business implications, and response requirements. Write all descriptive values in ${targetLanguage}.\n\nEmail Context:\n${input}\n\nReturn only valid JSON with these fields:\n- "relationship": relationship described in ${targetLanguage}\n- "urgency": urgency described in ${targetLanguage}\n- "priority": priority described in ${targetLanguage}\n- "emotionalTone": detected emotional tone in ${targetLanguage}\n- "businessContext": brief description of business context in ${targetLanguage}\n- "deadlines": array of mentioned deadlines\n- "risks": array of potential risks or concerns in ${targetLanguage}\n- "responseRequired": boolean\n- "suggestedResponseTime": recommended response timeframe in ${targetLanguage}\n- "keyStakeholders": array of mentioned stakeholders`

    const apiResponse = await callAnthropicAPI(
      [{ role: 'user', content: userPrompt }],
      ENHANCED_SYSTEM_PROMPT,
      2500
    )

    const responseText = apiResponse.content[0].text
    let result

    try {
      result = JSON.parse(responseText)
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = {
          relationship: 'unknown',
          urgency: 'medium',
          priority: 'medium',
          emotionalTone: 'Unknown',
          businessContext: 'Unable to analyze',
          deadlines: [],
          risks: [],
          responseRequired: false,
          suggestedResponseTime: 'Unknown',
          keyStakeholders: []
        }
      }
    }

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error analyzing email')
    return reply.code(500).send({ error: 'Failed to analyze email' })
  }
})

fastify.post('/api/email/extract-actions', async (request, reply) => {
  try {
    const { input, outputLang = 'korean' } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const targetLanguage = languageName(outputLang)
    const userPrompt = `Extract detailed action items from the following email. Write all descriptions, assignees, timeframes, dependencies, deliverables, commitments, requests, and decisions in ${targetLanguage}.\n\nEmail:\n${input}\n\nReturn only valid JSON with these fields:\n- "actionItems": array of objects with:\n  - "description": task description in ${targetLanguage}\n  - "assignee": assignee in ${targetLanguage}\n  - "deadline": deadline string or null\n  - "timeframe": estimated timeframe in ${targetLanguage}\n  - "priority": priority in ${targetLanguage}\n  - "status": status in ${targetLanguage}\n  - "dependencies": array of dependency descriptions in ${targetLanguage}\n  - "deliverables": array of expected deliverables in ${targetLanguage}\n- "commitmentsBySender": array of commitments made by the email sender in ${targetLanguage}\n- "requestsToRecipient": array of requests made to the recipient in ${targetLanguage}\n- "decisionsNeeded": array of decisions that need to be made in ${targetLanguage}\n- "followUpDate": suggested follow-up date or null`

    const apiResponse = await callAnthropicAPI(
      [{ role: 'user', content: userPrompt }],
      ENHANCED_SYSTEM_PROMPT,
      3000
    )

    const responseText = apiResponse.content[0].text
    let result

    try {
      result = JSON.parse(responseText)
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = {
          actionItems: [],
          commitmentsBySender: [],
          requestsToRecipient: [],
          decisionsNeeded: [],
          followUpDate: null
        }
      }
    }

    return reply.send(result)
  } catch (error) {
    request.log.error({ err: error }, 'Error extracting actions')
    return reply.code(500).send({ error: 'Failed to extract actions' })
  }
})

fastify.get('/health', async (request, reply) => {
  return { status: 'ok' }
})

const stadiumNames = {
  '문학': '인천SSG랜더스필드',
  '잠실': '잠실야구장',
  '사직': '사직야구장',
  '광주': '광주-기아 챔피언스 필드',
  '고척': '고척스카이돔',
  '대구': '대구삼성라이온즈파크',
  '수원': '수원KT위즈파크',
  '창원': '창원NC파크'
}

const stadiumCoordinates = {
  '문학': { latitude: 37.4371, longitude: 126.6932 },
  '인천SSG랜더스필드': { latitude: 37.4371, longitude: 126.6932 },
  '잠실': { latitude: 37.5121, longitude: 127.0719 },
  '잠실야구장': { latitude: 37.5121, longitude: 127.0719 },
  '사직': { latitude: 35.1940, longitude: 129.0614 },
  '사직야구장': { latitude: 35.1940, longitude: 129.0614 },
  '광주': { latitude: 35.1681, longitude: 126.8895 },
  '광주-기아 챔피언스 필드': { latitude: 35.1681, longitude: 126.8895 },
  '고척': { latitude: 37.4982, longitude: 126.8671 },
  '고척스카이돔': { latitude: 37.4982, longitude: 126.8671 },
  '대구': { latitude: 35.8410, longitude: 128.6814 },
  '대구삼성라이온즈파크': { latitude: 35.8410, longitude: 128.6814 },
  '수원': { latitude: 37.2997, longitude: 127.0097 },
  '수원KT위즈파크': { latitude: 37.2997, longitude: 127.0097 },
  '창원': { latitude: 35.2229, longitude: 128.5820 }
}

const teamSlugs = {
  '두산': 'doosan',
  'SSG': 'ssg',
  'LG': 'lg',
  '삼성': 'samsung',
  '롯데': 'lotte',
  '한화': 'hanwha',
  'KIA': 'kia',
  'KT': 'kt',
  '키움': 'kiwoom',
  'NC': 'nc'
}

function seoulDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

function gameStatusLabel(status) {
  return {
    SCHEDULED: '경기 예정',
    IN_PROGRESS: '경기 중',
    FINISHED: '경기 종료',
    CANCELED: '경기 취소'
  }[status] || status
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00+09:00`)
  date.setDate(date.getDate() + amount)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date)
}

function signedValue(value, digits = 1, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  const rounded = Number(value.toFixed(digits))
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(digits)}${suffix}`
}

function weatherLabel(code) {
  if (code === 0) return '맑음'
  if ([1, 2, 3].includes(code)) return '구름 많음'
  if ([45, 48].includes(code)) return '안개'
  if ([51, 53, 55, 56, 57].includes(code)) return '이슬비'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '비'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '눈'
  if ([95, 96, 99].includes(code)) return '뇌우'
  return '알 수 없음'
}

async function fetchStadiumWeather(date, startTime, stadium) {
  const coordinates = stadiumCoordinates[stadium]
  if (!coordinates) return null

  const previousDate = addDays(date, -1)
  const params = new URLSearchParams({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min',
    wind_speed_unit: 'ms',
    timezone: 'Asia/Seoul',
    start_date: previousDate,
    end_date: date
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!response.ok) throw new Error(`Weather API error: ${response.status}`)
  const data = await response.json()
  const hour = String(startTime || '18:00').slice(0, 2)
  const time = `${date}T${hour}:00`
  const previousTime = `${previousDate}T${hour}:00`
  const currentIndex = data.hourly?.time?.indexOf(time)
  const previousIndex = data.hourly?.time?.indexOf(previousTime)
  const dailyIndex = data.daily?.time?.indexOf(date)
  const previousDailyIndex = data.daily?.time?.indexOf(previousDate)

  if (currentIndex < 0 || dailyIndex < 0) return null
  const temperature = data.hourly.temperature_2m[currentIndex]
  const previousTemperature = previousIndex >= 0 ? data.hourly.temperature_2m[previousIndex] : null
  const wind = data.hourly.wind_speed_10m[currentIndex]
  const previousWind = previousIndex >= 0 ? data.hourly.wind_speed_10m[previousIndex] : null
  const maximum = data.daily.temperature_2m_max[dailyIndex]
  const minimum = data.daily.temperature_2m_min[dailyIndex]
  const previousMaximum = previousDailyIndex >= 0 ? data.daily.temperature_2m_max[previousDailyIndex] : null

  return {
    temperature: Math.round(temperature),
    temperatureChange: previousTemperature === null ? null : signedValue(temperature - previousTemperature, 1, '°'),
    maximum: Math.round(maximum),
    minimum: Math.round(minimum),
    maximumChange: previousMaximum === null ? null : signedValue(maximum - previousMaximum, 1, '°'),
    humidity: Math.round(data.hourly.relative_humidity_2m[currentIndex]),
    precipitationProbability: Math.round(data.hourly.precipitation_probability[currentIndex]),
    sky: weatherLabel(data.hourly.weather_code[currentIndex]),
    wind: Number(wind).toFixed(1),
    windChange: previousWind === null ? null : signedValue(wind - previousWind, 1, 'm/s')
  }
}

fastify.get('/api/sports/doosan', async (request, reply) => {
  const date = typeof request.query?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(request.query.date)
    ? request.query.date
    : seoulDateString()

  try {
    const games = await getGame(new Date(`${date}T00:00:00+09:00`))
    const doosanGames = (games || [])
      .filter((game) => game.homeTeam === '두산' || game.awayTeam === '두산')
      .map((game) => {
        const opponent = game.homeTeam === '두산' ? game.awayTeam : game.homeTeam
        const awayTeam = game.awayTeam === '두산' ? 'doosan' : teamSlugs[game.awayTeam]
        const homeTeam = game.homeTeam === '두산' ? 'doosan' : teamSlugs[game.homeTeam]
        return {
          id: game.id,
          date,
          startTime: game.startTime,
          stadiumKey: game.stadium,
          stadium: stadiumNames[game.stadium] || game.stadium,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          opponent,
          status: game.status,
          statusLabel: gameStatusLabel(game.status),
          score: game.score,
          currentInning: game.currentInning,
          weather: null,
          detailUrl: `https://yagu.today/matches/${date}/${awayTeam}-at-${homeTeam}`
        }
      })

    for (const game of doosanGames) {
      try {
        game.weather = await fetchStadiumWeather(date, game.startTime, game.stadiumKey)
      } catch (weatherError) {
        request.log.warn({ err: weatherError }, 'Weather data unavailable')
      }
    }

    return reply.send({ date, team: '두산', games: doosanGames, updatedAt: new Date().toISOString() })
  } catch (error) {
    request.log.error({ err: error }, 'Error fetching Doosan game')
    return reply.code(503).send({ error: '경기 정보를 잠시 불러오지 못했습니다.' })
  }
})

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3001, host: '0.0.0.0' })
    console.log(`Server listening on http://localhost:${process.env.PORT || 3001}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
