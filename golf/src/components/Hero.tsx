import { LinkButton } from "./ui";

/**
 * The welcome: the owner's own photograph of a course at sunrise, with the
 * ball, the name and one thing to do. Bleeds to the edges of the phone. The
 * drawn scene underneath shows until the photo arrives, and instead of it if
 * it never does.
 */
export function Hero() {
  return (
    <section className="relative -mx-4 -mt-4 overflow-hidden rounded-b-[2rem] bg-turf-900 text-white shadow-md">
      <svg
        viewBox="0 0 390 600"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        className="block h-[min(64vh,620px)] min-h-[440px] w-full"
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b9d5e6" />
            <stop offset="0.55" stopColor="#e6e1cf" />
            <stop offset="1" stopColor="#f3e3bd" />
          </linearGradient>
          <linearGradient id="fairway" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4c9a54" />
            <stop offset="1" stopColor="#2f6d3a" />
          </linearGradient>
          <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff4c2" />
            <stop offset="1" stopColor="#fff4c2" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sky and a low sun. */}
        <rect width="390" height="600" fill="url(#sky)" />
        <circle cx="300" cy="150" r="90" fill="url(#sun)" />
        <circle cx="300" cy="150" r="22" fill="#fff8d6" />

        {/* Far hills. */}
        <path d="M0 230 C 60 200, 120 210, 180 190 S 300 170, 390 200 L390 300 L0 300 Z" fill="#7fa77b" />
        <path d="M0 260 C 80 235, 160 255, 230 235 S 340 215, 390 240 L390 320 L0 320 Z" fill="#5d8c5c" />

        {/* Tree line. */}
        <g fill="#2f5a34">
          <ellipse cx="40" cy="262" rx="26" ry="20" />
          <ellipse cx="82" cy="256" rx="30" ry="24" />
          <ellipse cx="130" cy="264" rx="22" ry="17" />
          <ellipse cx="300" cy="258" rx="28" ry="22" />
          <ellipse cx="345" cy="266" rx="34" ry="24" />
          <ellipse cx="385" cy="260" rx="24" ry="20" />
        </g>

        {/* The fairway sweeping up to a green, with mowing lines. */}
        <path d="M-20 600 C 40 470, 90 400, 150 330 C 200 275, 260 270, 320 262 L 420 262 L 420 600 Z" fill="url(#fairway)" />
        <g fill="#5aa862" opacity="0.35">
          <path d="M20 600 C 70 480, 120 410, 175 345 L 195 350 C 140 420, 95 495, 55 600 Z" />
          <path d="M110 600 C 150 500, 200 430, 250 380 L 268 388 C 220 440, 175 510, 145 600 Z" />
          <path d="M210 600 C 240 520, 290 460, 340 420 L 356 430 C 310 470, 265 530, 245 600 Z" />
        </g>

        {/* Rough on the left, a bunker, the green and its flag. */}
        <path d="M-20 600 C 30 520, 60 470, 110 420 C 70 430, 30 480, -20 520 Z" fill="#3c7a42" />
        <ellipse cx="238" cy="352" rx="34" ry="12" fill="#efe2b3" />
        <ellipse cx="300" cy="318" rx="58" ry="20" fill="#6fbf74" />
        <ellipse cx="300" cy="318" rx="58" ry="20" fill="none" stroke="#4c9a54" strokeWidth="2" />
        <circle cx="306" cy="320" r="2.6" fill="#1d3a25" />
        <rect x="305" y="240" width="2.4" height="80" fill="#f7f7f5" />
        <path d="M307.4 242 L 336 251 L 307.4 260 Z" fill="#f2c14e" />

      </svg>

      <img
        src="/hero.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[62%_40%]"
      />
      {/* Dusk over the lower half so the words read. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0f2417]/40 to-[#0f2417]/95"
      />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-8 text-center">
        <svg viewBox="0 0 512 512" aria-hidden="true" className="h-24 w-24 drop-shadow-lg">
          <defs>
            <clipPath id="hero-ball">
              <circle cx="256" cy="256" r="232" />
            </clipPath>
            <pattern
              id="hero-dimples"
              width="44"
              height="44"
              patternUnits="userSpaceOnUse"
              patternTransform="translate(10 10)"
            >
              <circle cx="11" cy="11" r="8" fill="#e3e7e1" />
              <circle cx="33" cy="33" r="8" fill="#e3e7e1" />
            </pattern>
          </defs>
          <circle cx="256" cy="256" r="232" fill="#ffffff" />
          <g clipPath="url(#hero-ball)">
            <rect width="512" height="512" fill="url(#hero-dimples)" />
          </g>
          <text
            x="256"
            y="336"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="800"
            fontSize="270"
            fill="#23542f"
            textAnchor="middle"
          >
            1
          </text>
          <polygon points="200,360 312,360 256,430" fill="#23542f" />
        </svg>
        <h1 className="mt-4 text-[2rem] font-black uppercase leading-none tracking-[0.28em] drop-shadow">
          One Downs
        </h1>
        <p className="mt-3 max-w-xs text-sm text-white/85">
          Tee flips, presses and greenies. The money, hole by hole.
        </p>
        <div className="mt-6 w-full max-w-xs">
          <LinkButton href="/new" variant="secondary" full>
            Start a round
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
