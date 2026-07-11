## ReadQuest
ReadQuest > A reading companion designed from the ground up for children with dyslexia and > dysgraphia — making reading practice accessible, low-pressure and genuinely fun. 🔗 

**Live demo:** https://read-quest-omega.vercel.app/ 

## Overview 
ReadQuest is a reading-support app built around the needs of neurodivergent readers. Where most tools treat accessibility as an afterthought, ReadQuest starts there — readable typography, generous spacing, audio support and bite-sized challenges that reward progress instead of penalising mistakes. I built it for my son, who has dyslexia and dysgraphia, to prove that thoughtfully applied AI can make reading feel like a quest rather than a chore. 

## Features
🔤 **Dyslexia-friendly design** — [OpenDyslexic / high-legibility font], adjustable text size and spacing, low-glare colour themes
🔊 **Text-to-speech** so words can be heard as well as read
🧩 **Phonics-based challenges** broken into short, achievable steps
🎮 **Quest-style progression** with rewards that build reading confidence
🗣️ [AI-generated stories/practice tuned to the child's reading level] 

## Tech stack 
[React / Next.js] on the front end 
[LLM provider — e.g. Anthropic Claude / Google Gemini] for adaptive content 
[Web Speech API / provider] for text-to-speech - Deployed on Vercel 

## Getting started 
'''bash 
git clone https://github.com/jonathanbickerton-alt/ReadQuest.git 
cd ReadQuest 
npm install 
npm run dev


[NEXT_PUBLIC_API_KEY=your_key_here]
## Accessibility
Accessibility is the point, not a feature. ReadQuest is designed to be usable by children who find conventional reading tools frustrating — if something here helps another family, that's the win.

## Motivation
Watching my son struggle with tools that weren't built for how he reads, I wanted to build something that started from his needs and made no compromises. ReadQuest is that attempt — and the project that convinced me this is the work I want to do.
