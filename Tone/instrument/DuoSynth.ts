import { Monophonic, MonophonicOptions } from "./Monophonic";
import { MonoSynth, MonoSynthOptions } from "./MonoSynth";
import { Envelope } from "../component/envelope/Envelope";
import { FrequencyEnvelope } from "../component/envelope/FrequencyEnvelope";
import { Signal } from "../signal/Signal";
import { readOnly, RecursivePartial, writable } from "../core/util/Interface";
import { OmniOscillator } from "../source/oscillator/OmniOscillator";
import { LFO } from "../source/oscillator/LFO";
import { Gain, } from "../core/context/Gain";
import { ToneAudioNode } from "../core/context/ToneAudioNode";
import { Multiply } from "../signal/Multiply";
import { NormalRange, Positive, Seconds, Time } from "../core/type/Units";
import { omitFromObject, optionsFromArguments } from "../core/util/Defaults";
import { Source } from "../source/Source";
import { EQ } from "../core/util/Math";

export interface DuoSynthOptions extends MonophonicOptions {
	voice0: MonoSynthOptions;
	voice1: MonoSynthOptions;
	vibratoRate: number;
	vibratoAmount: Positive;
	harmonicity: Positive;
}

/**
 * DuoSynth is a monophonic synth composed of two
 * MonoSynths run in parallel with control over the
 * frequency ratio between the two voices and vibrato effect.
 * <img src="https://docs.google.com/drawings/d/1bL4GXvfRMMlqS7XyBm9CjL9KJPSUKbcdBNpqOlkFLxk/pub?w=1012&h=448">
 * @example
 * import { DuoSynth } from "tone";
 * const duoSynth = new DuoSynth().toDestination();
 * duoSynth.triggerAttackRelease("C4", "2n");
 */
export class DuoSynth<Options extends DuoSynthOptions> extends Monophonic<Options> {

	readonly name = "DuoSynth";

	readonly detune: Signal<"cents">;
		
	/**
	 * the first voice
	 */
	readonly voice0: MonoSynth;

	/**
	 * the second voice
	 */
	readonly voice1: MonoSynth;
	
	/**
	 * the frequency control
	 */
	readonly frequency: Signal<"frequency">;
	
	/**
	 * The amount of vibrato
	 */
	public vibratoAmount: number;

	/**
	 * the vibrato frequency
	 */
	public vibratoRate: Signal<"frequency">;

	/**
	 * Harmonicity is the ratio between the two voices. A harmonicity of
	 * 1 is no change. Harmonicity = 2 means a change of an octave.
	 * @example
	 * // pitch voice1 an octave below voice0
	 * duoSynth.harmonicity.value = 0.5;
	 */
	public harmonicity: Signal<"positive">;

	/**
	 * The vibrato LFO.
	 */
	private _vibrato: LFO;

	/**
	 * the vibrato gain
	 */
	private _vibratoGain: Gain<"decibels">;

	constructor(options?: RecursivePartial<DuoSynthOptions>);
	constructor() {
		super(optionsFromArguments(DuoSynth.getDefaults(), arguments));
		const options = optionsFromArguments(DuoSynth.getDefaults(), arguments);

		this.voice0 = new MonoSynth(Object.assign(options.voice0, { 
			context: this.context, 
			onsilence: () => this._onsilence() 
		}));
		this.voice1 = new MonoSynth(Object.assign(options.voice1, { 
			context: this.context, 
			onsilence: () => this._onsilence() 
		}));

		this.harmonicity = new Multiply({
			context: this.context,
			units: "positive",
			value: options.harmonicity,
		});

		this._vibrato = new LFO(Object.assign(options.vibratoRate, {
			context: this.context,
			min: -50,
			max: 50
		}));
		// start the vibrato immediately
		this._vibrato.start();
		this.vibratoRate = this._vibrato.frequency;
		this._vibratoGain = new Gain({
			context: this.context,
			units: "decibels",
			gain: options.vibratoAmount
		});
		this.vibratoAmount = this._vibratoGain.gain.value;

		this.frequency = new Signal({
			context: this.context,
			units: "frequency",
			value: 440
		});
		this.detune = new Signal({
			context: this.context,
			units: "cents",
			value: options.detune
		});
		
		// control the two voices frequency
		this.frequency.connect(this.voice0.frequency);
		this.frequency.chain(this.harmonicity, this.voice1.frequency);

		this._vibrato.connect(this._vibratoGain);
		this._vibratoGain.fan(this.voice0.detune, this.voice1.detune);

		this.detune.fan(this.voice0.detune, this.voice1.detune);

		this.voice0.connect(this.output);
		this.voice1.connect(this.output);

		readOnly(this, ["voice0", "voice1", "frequency", "vibratoAmount", "vibratoRate"]);
	}

	private _onsilence() {
		const totalEnvelope = this.voice0.envelope.getValueAtTime(this.now()) + this.voice1.envelope.getValueAtTime(this.now());
		if (EQ(totalEnvelope, 0)) {
			this.onsilence(this);
		}
	}

	static getDefaults(): DuoSynthOptions {
		return Object.assign(Monophonic.getDefaults(), {
			vibratoAmount: 0.5,
			vibratoRate: 5,
			harmonicity: 1.5,
			voice0: Object.assign(MonoSynth.getDefaults(), {
				volume: -10,
				portamento: 0,
				oscillator: Object.assign(
					omitFromObject(OmniOscillator.getDefaults(), [
						...Object.keys(Source.getDefaults()),
						"frequency",
						"detune"
					]),
					{
						type: "sine"
					}),
				filterEnvelope: Object.assign(
					omitFromObject(
						FrequencyEnvelope.getDefaults(),
						Object.keys(ToneAudioNode.getDefaults())
					),
					{
						attack: 0.01,
						decay: 0.0,
						sustain: 1,
						release: 0.5
					},
				),
				envelope: Object.assign(
					omitFromObject(
						Envelope.getDefaults(),
						Object.keys(ToneAudioNode.getDefaults())
					),
					{
						attack: 0.01,
						decay: 0.0,
						sustain: 1,
						release: 0.5
					}
				)
			}),
			voice1: Object.assign(MonoSynth.getDefaults(), {
				volume: -10,
				portamento: 0,
				oscillator: Object.assign(
					omitFromObject(OmniOscillator.getDefaults(), [
						...Object.keys(Source.getDefaults()),
						"frequency",
						"detune"
					]),
					{
						type: "sine"
					}),
				filterEnvelope: Object.assign(
					omitFromObject(
						FrequencyEnvelope.getDefaults(),
						Object.keys(ToneAudioNode.getDefaults())
					), 
					{
						attack: 0.01,
						decay: 0.0,
						sustain: 1,
						release: 0.5
					},
				),
				envelope: Object.assign(
					omitFromObject(
						Envelope.getDefaults(),
						Object.keys(ToneAudioNode.getDefaults())
					),
					{
						attack: 0.01,
						decay: 0.0,
						sustain: 1,
						release: 0.5
					}
				)
			}),
		});
	}

	/**
	 * Start the attack portion of the envelopes
	 * @param {Time} [time=now] the time the attack should start
	 * @param {NormalRange} [velocity=1] the velocity of the note (0-1)
	 */
	triggerEnvelopeAttack(time: Seconds, velocity: NormalRange = 1): void {
		time = this.toSeconds(time);
		this.voice0.triggerAttack(time, velocity);
		this.voice1.triggerAttack(time, velocity);
	}

	/**
	 * Start the release portion of the envelopes
	 *
	 * @param {Time} [time=now] the time the release should start
	 */
	triggerEnvelopeRelease(time: Seconds): void {
		this.voice0.triggerRelease(time);
		this.voice1.triggerRelease(time);
	}

	dispose(): this {
		super.dispose();
		this.voice0.dispose();
		this.voice1.dispose();
		this.frequency.dispose();
		this.detune.dispose();
		this._vibrato.dispose();
		this.vibratoRate.dispose();
		this._vibratoGain.dispose();
		this.harmonicity.dispose();
		return this;
	}
}

