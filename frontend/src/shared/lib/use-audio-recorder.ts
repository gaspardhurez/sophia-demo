import { useCallback, useEffect, useRef, useState } from 'react'

/** Pourquoi l'enregistrement n'a pas pu commencer. */
export type RecorderFailure =
  /** Le micro est refusé (par l'utilisateur ou les réglages du site). */
  | 'denied'
  /** Aucun micro branché. */
  | 'no-device'
  /** Le navigateur ne sait pas faire (pas d'`AudioWorklet`, page non sûre). */
  | 'unsupported'
  /** Autre chose : le micro est pris ailleurs, l'audio a planté. */
  | 'failed'

/** Le nombre de barres du niveau (la maquette en dessine 12). */
const LEVEL_BARS = 12
/** Un relevé du niveau toutes les 80 ms : assez vif pour suivre la voix,
 *  assez lent pour ne pas rendre la page à chaque image. */
const LEVEL_EVERY_MS = 80
/** Le format rendu : PCM 16 bits, mono, 16 kHz — ce que lit Whisper. */
const TARGET_RATE = 16000
/** Une tranche toutes les 0,25 s : assez court pour suivre la parole,
 *  assez long pour ne pas noyer le réseau de messages. */
const CHUNK_SAMPLES = TARGET_RATE / 4
/** Le temps laissé au processeur pour rendre sa dernière tranche. */
const FLUSH_TIMEOUT_MS = 300

/**
 * Le processeur audio, chargé depuis une URL `blob:` (sans fichier à
 * servir) : il **rééchantillonne** le micro à 16 kHz (interpolation
 * linéaire, sur la position fractionnaire qui court d'un bloc à l'autre),
 * convertit en 16 bits et envoie des tranches de 0,25 s au fil principal.
 * « flush » envoie le reste puis « done ». Quand le contexte tourne déjà
 * à 16 kHz (Chrome, Safari le rééchantillonnent eux-mêmes, filtrés), le
 * rapport vaut 1 et il ne fait que convertir.
 */
const WORKLET = `
class Pcm16k extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / ${TARGET_RATE}
    this.t = 0
    this.last = 0
    this.buf = new Int16Array(${CHUNK_SAMPLES})
    this.n = 0
    this.port.onmessage = (e) => {
      if (e.data !== 'flush') return
      if (this.n) this.port.postMessage(this.buf.slice(0, this.n).buffer)
      this.n = 0
      this.port.postMessage('done')
    }
  }
  push(v) {
    const s = Math.max(-1, Math.min(1, v))
    this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff
    if (this.n === this.buf.length) {
      this.port.postMessage(this.buf.buffer, [this.buf.buffer])
      this.buf = new Int16Array(${CHUNK_SAMPLES})
      this.n = 0
    }
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input || !input.length) return true
    let t = this.t
    while (t < input.length - 1) {
      const i = Math.floor(t)
      const f = t - i
      const a = i < 0 ? this.last : input[i]
      this.push(a + (input[i + 1] - a) * f)
      t += this.ratio
    }
    this.t = t - input.length
    this.last = input[input.length - 1]
    return true
  }
}
registerProcessor('pcm-16k', Pcm16k)
`

function failureOf(error: unknown): RecorderFailure {
  const name = (error as { name?: unknown } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'no-device'
  return 'failed'
}

/**
 * Le contexte audio et la source du micro. À 16 kHz d'abord : le
 * navigateur rééchantillonne mieux que nous. Firefox refuse de brancher un
 * micro sur un contexte d'une autre fréquence : on retombe alors sur la
 * fréquence par défaut, et le processeur rééchantillonne.
 */
function openContext(stream: MediaStream) {
  try {
    const audio = new AudioContext({ sampleRate: TARGET_RATE })
    try {
      return { audio, source: audio.createMediaStreamSource(stream) }
    } catch {
      void audio.close().catch(() => {})
    }
  } catch {
    // fréquence refusée : celle par défaut
  }
  const audio = new AudioContext()
  return { audio, source: audio.createMediaStreamSource(stream) }
}

/**
 * Enregistrer le micro **en flux** : du PCM 16 bits, mono, 16 kHz, rendu
 * par tranches de 0,25 s à mesure qu'on parle (`AudioWorklet`) —
 * agnostique de ce qu'on en fait.
 *
 * - `start()` demande le micro (le navigateur pose sa question la première
 *   fois) puis enregistre ; un refus, l'absence de micro ou un navigateur
 *   qui ne sait pas faire passent par `onFailure`, sans lever. Rend `true`
 *   si l'enregistrement a commencé.
 * - `onChunk` reçoit chaque tranche (un `ArrayBuffer`).
 * - `stop()` envoie la dernière tranche, puis `onEnd`. Au-delà de `maxMs`,
 *   l'enregistrement s'arrête **de lui-même**, comme sur `stop()`.
 * - `cancel()` arrête **sans rien rendre de plus** ; quitter le composant
 *   annule de même (un enregistrement ne survit pas à l'écran qui l'a lancé).
 * - `levels` : les derniers niveaux du micro (12, de 0 à 1, le plus récent
 *   en dernier), lus par un `AnalyserNode` — ce qui montre qu'il entend.
 *
 * Le micro est rendu (pistes arrêtées, témoin du navigateur éteint) dès
 * que l'enregistrement s'arrête, quelle qu'en soit la raison.
 */
export function useAudioRecorder({
  maxMs,
  onChunk,
  onEnd,
  onFailure,
}: {
  maxMs: number
  onChunk: (pcm: ArrayBuffer) => void
  onEnd: () => void
  onFailure: (failure: RecorderFailure) => void
}) {
  const [recording, setRecording] = useState(false)
  const [levels, setLevels] = useState<number[]>(() =>
    Array(LEVEL_BARS).fill(0),
  )
  // Les rappels du dernier rendu, lus quand l'audio arrive.
  const callbacks = useRef({ onChunk, onEnd, onFailure })
  useEffect(() => {
    callbacks.current = { onChunk, onEnd, onFailure }
  })
  const session = useRef<{
    finish: (discard: boolean) => void
  } | null>(null)
  // Le navigateur demande le micro : un second `start` attend sa réponse.
  const asking = useRef(false)
  // Monté : un micro accordé après coup ne lance rien.
  const alive = useRef(true)

  const start = useCallback(async (): Promise<boolean> => {
    if (session.current || asking.current) return false
    if (
      typeof AudioWorkletNode === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      callbacks.current.onFailure('unsupported')
      return false
    }
    let stream: MediaStream
    asking.current = true
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (err) {
      if (alive.current) callbacks.current.onFailure(failureOf(err))
      return false
    } finally {
      asking.current = false
    }
    // L'écran a été quitté pendant que le navigateur demandait le micro :
    // on le rend aussitôt.
    if (!alive.current) {
      stream.getTracks().forEach((t) => t.stop())
      return false
    }

    let audio: AudioContext | null = null
    let node: AudioWorkletNode
    let meter: number | undefined
    try {
      const opened = openContext(stream)
      audio = opened.audio
      const url = URL.createObjectURL(
        new Blob([WORKLET], { type: 'text/javascript' }),
      )
      try {
        await audio.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      // Hors d'un geste (le micro a été demandé entre-temps), le contexte
      // peut naître suspendu.
      await audio.resume()
      node = new AudioWorkletNode(audio, 'pcm-16k')
      opened.source.connect(node)
      // Branché à la sortie pour être tiré ; il n'y écrit rien (silence).
      node.connect(audio.destination)

      // Le niveau : la moyenne quadratique du signal, relevée à intervalle
      // fixe.
      const analyser = audio.createAnalyser()
      analyser.fftSize = 512
      opened.source.connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      meter = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const v of samples) sum += ((v - 128) / 128) ** 2
        // La voix parlée tourne autour de 0,05–0,2 : on l'étire.
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 5)
        setLevels((prev) => [...prev.slice(1), level])
      }, LEVEL_EVERY_MS)
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop())
      void audio?.close().catch(() => {})
      if (alive.current) callbacks.current.onFailure(failureOf(err))
      return false
    }
    if (!alive.current) {
      window.clearInterval(meter)
      stream.getTracks().forEach((t) => t.stop())
      void audio.close().catch(() => {})
      return false
    }

    let done = false
    let flushTimer: number | undefined
    const release = (ended: boolean) => {
      if (done) return
      done = true
      window.clearTimeout(cap)
      window.clearTimeout(flushTimer)
      window.clearInterval(meter)
      node.port.onmessage = null
      stream.getTracks().forEach((t) => t.stop())
      void audio?.close().catch(() => {})
      session.current = null
      setRecording(false)
      setLevels(Array(LEVEL_BARS).fill(0))
      if (ended) callbacks.current.onEnd()
    }
    node.port.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
      if (e.data === 'done') release(true)
      else if (e.data instanceof ArrayBuffer) callbacks.current.onChunk(e.data)
    }
    const finish = (discard: boolean) => {
      if (discard) return release(false)
      // La dernière tranche, puis la fin ; un processeur muet n'empêche
      // pas de finir.
      node.port.postMessage('flush')
      flushTimer = window.setTimeout(() => release(true), FLUSH_TIMEOUT_MS)
    }
    const cap = window.setTimeout(() => finish(false), maxMs)
    stream.getTracks().forEach((t) => {
      // Micro débranché en cours de route : ce qui est dit est gardé.
      t.onended = () => finish(false)
    })
    session.current = { finish }
    setRecording(true)
    return true
  }, [maxMs])

  const stop = useCallback(() => session.current?.finish(false), [])
  const cancel = useCallback(() => session.current?.finish(true), [])

  // Quitter l'écran en cours d'enregistrement : rien ne part de plus, le
  // micro est rendu.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      session.current?.finish(true)
    }
  }, [])

  return { recording, levels, start, stop, cancel }
}
