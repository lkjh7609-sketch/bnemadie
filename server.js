import Fastify from 'fastify'
import cors from '@fastify/cors'
import crypto from 'crypto'
import dotenv from 'dotenv'

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
    /\.netlify\.app$/
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
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      messages: messages,
      system: systemPrompt
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

// Authentication middleware
fastify.addHook('onRequest', async (request, reply) => {
  const publicRoutes = ['/health', '/api/auth/register', '/api/auth/login', '/api/auth/verify']

  if (publicRoutes.includes(request.url)) {
    return
  }

  const apiKey = request.headers['x-api-key']

  if (!apiKey || !apiKeys.has(apiKey)) {
    reply.code(401).send({ error: 'Unauthorized' })
    return
  }

  request.user = apiKeys.get(apiKey)
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
6. Cultural Awareness: Korean business emails often use more formal honorifics and indirect language. English business emails are typically more direct but still polite.`

const MAX_INPUT_LENGTH = 10000

fastify.post('/api/email/generate', async (request, reply) => {
  try {
    const { input, inputLang, outputLang, tone, length } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    let userPrompt = `User Input:\n${input}\n\n`

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

    userPrompt += '\nPlease generate an appropriate professional email based on the above information. Return only valid JSON with "subject" and "content" fields.'

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
          content: responseText
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
    const { input, outputLang, tone, length } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    let userPrompt = `The user wants to reply to the following email. Analyze the email and generate an appropriate reply.\n\nOriginal Email and User's Instructions:\n${input}\n\n`

    if (outputLang && outputLang !== 'auto') {
      userPrompt += `Reply Language: ${outputLang}\n`
    }

    if (tone && tone !== 'auto') {
      userPrompt += `Tone: ${tone}\n`
    }

    if (length) {
      userPrompt += `Length: ${length}\n`
    }

    userPrompt += '\nGenerate a professional reply email. Return only valid JSON with "subject" and "content" fields.'

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
          content: responseText
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
    const { input } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const userPrompt = `Check and improve the grammar, spelling, and style of the following English email. Make it sound natural and professional for business communication.\n\nOriginal Email:\n${input}\n\nReturn only valid JSON with these fields:\n- "original": the original text\n- "improved": the corrected version\n- "changes": an array of objects with "before", "after", and "explanation" for each significant change`

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
    const { input } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const userPrompt = `Analyze and summarize the following email. Extract key information.\n\nEmail:\n${input}\n\nReturn only valid JSON with these fields:\n- "summary": brief summary of the email\n- "keyPoints": array of main points\n- "actionItems": array of action items or requests\n- "deadline": deadline if mentioned (or null)\n- "tone": the tone of the email (formal/professional/friendly/etc)`

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
    const { content, tone } = request.body

    if (!content || typeof content !== 'string') {
      return reply.code(400).send({ error: 'Invalid content' })
    }

    if (content.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Content too long' })
    }

    const userPrompt = `Please rewrite the following email with a ${tone} tone. Keep the core message the same but adjust the tone appropriately.\n\nOriginal Email:\n${content}\n\nReturn only valid JSON with "subject" and "content" fields.`

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
          content: responseText
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
    const { input } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const userPrompt = `Analyze the following user input and determine what they want to do with email. Detect the task type, input language, and suggest appropriate tone.\n\nUser Input:\n${input}\n\nReturn only valid JSON with these fields:\n- "taskType": one of "generate", "reply", "grammar", "summarize"\n- "detectedLanguage": detected language of input (Korean/English/etc)\n- "suggestedTone": recommended tone (professional/friendly/direct)\n- "confidence": confidence level 0-1\n- "reasoning": brief explanation of the detection`

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
          detectedLanguage: 'Unknown',
          suggestedTone: 'professional',
          confidence: 0.5,
          reasoning: 'Unable to parse response'
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
    const { input } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const userPrompt = `Perform a deep structural analysis of the following email context. Analyze relationship dynamics, urgency, business implications, and response requirements.\n\nEmail Context:\n${input}\n\nReturn only valid JSON with these fields:\n- "relationship": one of "superior", "peer", "subordinate", "client", "vendor", "unknown"\n- "urgency": one of "critical", "high", "medium", "low"\n- "priority": one of "critical", "high", "medium", "low"\n- "emotionalTone": detected emotional tone\n- "businessContext": brief description of business context\n- "deadlines": array of mentioned deadlines\n- "risks": array of potential risks or concerns\n- "responseRequired": boolean\n- "suggestedResponseTime": recommended response timeframe\n- "keyStakeholders": array of mentioned stakeholders`

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
    const { input } = request.body

    if (!input || typeof input !== 'string') {
      return reply.code(400).send({ error: 'Invalid input' })
    }

    if (input.length > MAX_INPUT_LENGTH) {
      return reply.code(400).send({ error: 'Input too long' })
    }

    const userPrompt = `Extract detailed action items from the following email. Include task descriptions, assignees, deadlines, priorities, status, dependencies, deliverables, commitments, requests, and decisions needed.\n\nEmail:\n${input}\n\nReturn only valid JSON with these fields:\n- "actionItems": array of objects with:\n  - "description": task description\n  - "assignee": one of "sender", "recipient", "team", "specific person name", "unknown"\n  - "deadline": deadline string or null\n  - "timeframe": estimated timeframe\n  - "priority": one of "critical", "high", "medium", "low"\n  - "status": one of "requested", "committed", "pending", "in-progress"\n  - "dependencies": array of dependency descriptions\n  - "deliverables": array of expected deliverables\n- "commitmentsBySender": array of commitments made by the email sender\n- "requestsToRecipient": array of requests made to the recipient\n- "decisionsNeeded": array of decisions that need to be made\n- "followUpDate": suggested follow-up date or null`

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
