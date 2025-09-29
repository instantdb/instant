---
title: 'Founding Firebase with James Tamplin [Video]'
date: '2025-09-29'
authors: stopachka
---

::transcript re64AhYrYBY

[!video](https://www.youtube.com/watch?v=re64AhYrYBY 'Founding Firebase with James Tamplin')

[00:00:10] **Stopa:** Hey guys. So we grew up building on fire base. Well, what was it like to build Firebase? In this interview, we talk with James Tamplin, the founder, and we start at the very beginning from all the different startups that led up there to all the lessons learned.

[00:00:27] **Stopa:** We really hope you enjoy it. Thanks y'all. Thank you so much, James.

[00:00:33] **James:** You are so very welcome.

[00:00:35] **Stopa:** Thank you so much for coming guys. Hi everyone.

[00:00:42] **Stopa:** Alright, so we all know the introductions. I mean, James founded Firebase. We grew up building Firebase. We're building on top of Firebase. So, so how cool is it that we get to learn the origin stories? Um, James, maybe we can just get into it honestly. Uh, where'd you grow up? What's, what's, let's start from the beginning.

[00:01:04] **James:** Do, do you mind if I throw you off the rails? Like entire Go, go for it immediately.

[00:01:08] **Stopa:** Let's go. Cool.

[00:01:09] **James:** Hey everyone. How, how many of you have like, built on Firebase? I just, cool. Um, how many of you, like one of the first things you used was Firebase when you were learning to program. Cool. That, that gives me the warm and fuzzies.

[00:01:24] **James:** So, uh, Aw. Yeah. And then, thank you for having me. It's like. It's a treat to be here. I've, I've known these guys for three years now. Yeah. And you, you always impress me, so I'm excited to do this with you.

[00:01:37] **Stopa:** Cheers, James. Heck yeah. Yeah. James, uh, is, uh, he sat our back since the beginning. He's been, uh, every two weeks.

[00:01:47] **Stopa:** He, he, he gave us advice. I remember, um, you know, we were one year in the hole. People had forgotten us except, except James, you know? And then, uh, we were, we were coming out and we're like, ah, you know, we need to talk to customers, but like, here's what we're gonna do. We're gonna like, make a plan to talk to customers later.

[00:02:10] **Stopa:** And then we told Jay about this. He's like, what if you just get your friends to run the program today? You know? And that changed the game.

[00:02:20] **James:** If I could have reached through the screen and slapped you,

[00:02:23] **Stopa:** I would've done that. We got it. We got it through the screen, sir.

[00:02:29] **James:** I was, we, we, so we checked in every two weeks.

[00:02:31] **James:** I was like, next two weeks from now, 10, 10 user feedback sessions. And Oppa was like, how about like five? I was like, no, OPPA 10. And that was a big part of fire base. And so I was trying to impart that. So, yeah.

[00:02:43] **Stopa:** Heck yeah. Alright, well, you know, we, I I, I am actually just genuinely curious 'cause you are from Britain.

[00:02:50] **James:** I am from Britain.

[00:02:51] **Stopa:** How was that like, were, you know,

[00:02:53] **James:** I'm not from Britain, so you're from Georgia? I'm from Georgia. Um, not the, not the state. Um, I What was that like? Can you refine the question one level? I can take a stab at it, at that level.

[00:03:05] **Stopa:** Yeah. Well, here's my question. How, how was it like growing? You grew up in England and so you were maybe 13,

[00:03:10] **James:** right?

[00:03:11] **James:** Or it's a complex series of numbers, but like 10 and then Minnesota and then back to England when I was 13, Uhhuh and then back to Minnesota Oh, wow. For the last few years of high school. And then I did college in both as well. So I was, it was a, like a very like transatlantic upbringing for sure.

[00:03:27] **James:** Interesting.

[00:03:28] **Stopa:** Okay. Well, here's one question I just have is, what are the good things you got out of British culture and what are the good things you got out? American culture. Ooh.

[00:03:37] **James:** Um, the good things out of British culture. Uh, humor, politeness. Um, I think I like, yeah. My, there's just like a, like quiet resilience to like the British people.

[00:03:56] **James:** Like, just kinda like, like, you know, keep calm and carry on ness that like was useful in startup land. Yeah. Um, the emotional repression has like, it's like deferring the problems until later. So, so maybe like short to medium term benefit and then long term you have to sift through the baggage. Uh, and then American culture, I think there's like a boldness and an outgoingness in an American culture that is really, it's kind of like here I am like a Google.

[00:04:26] **James:** Yeah. Like all of the Brits, like in the London office had a huge disadvantage because all the Americans would be upselling themselves with like a swagger or a bravado, like I refactored, spanner, or whatever it happens to be. And um, the Brits would kind, it's kind of a uhhuh would downplay, there's like a self-deprecating bit that goes along with the humor and it, yeah, it was, it was, they had to be like, taught how to speak well of themselves.

[00:04:56] **James:** So there's, there's almost like, um, like a self-image, like British culture, like puts a little bit of a cap on your self image in terms of like, oh yeah, I'm awesome. Like, that's kind of disallowed in British culture or, or frowned upon.

[00:05:13] **Stopa:** Interesting. So then, okay, so you go to Minnesota, right? I was, I

[00:05:20] **James:** was taken to Minnesota.

[00:05:21] **James:** You were taken to Minnesota By my parents. Your parents? Yeah. I'll tell you this, it was not my choice. Yeah. I was very against it.

[00:05:27] **Stopa:** Yeah. I had a similar experience. I'm curious if you had something similar, how yours was. Where, when I went to, I went to Canada when I was nine. Mm-hmm. It was like, I don't remember anything from like nine to 13.

[00:05:39] **Stopa:** You know, like I, I, I had like anger management classes. You my, have you considered therapy? Yes. Sometimes. Uh, so, so what was it like go, going to Minnesota? What, what was the first few years like?

[00:05:54] **James:** I was terrible. Mm-hmm. Um, yeah. I mean, I mean, sounds like a similar experience. Yeah. Uh, the way, the way I've sometimes described it is it's like an organ transplant was rejected by the, the host.

[00:06:08] **James:** Oh. Oh man. I relate. Yeah. Uh, no, it was, it was a, it was a very difficult two years. Uh, yeah. The first two years were very difficult. Yeah. Um, yeah. Like kids are mean. Um, I was kind of the, you know, the kid with bad teeth and a weird accent, which didn't help with the stereotypes. Uh, and yeah, kids, kids pick on each other and it was, it was, yeah, it was difficult.

[00:06:38] **James:** Um, I, like, there's many, many stories of me not wanting to get out of school, out of car to go to school when my mom would drop me off and, um, the winter sucked and, yeah. I missed my friends. I missed my, my grandparents. Yeah. Um, yeah, I had, I had like a very idyllic, nice life in like suburban, you know, suburban second tier city in England.

[00:07:01] **James:** And then I got kind of like moved to this like frigid

[00:07:05] **Stopa:** Yeah. Place

[00:07:05] **James:** where the people weren't nice to me.

[00:07:08] **Stopa:** Oh man. Yeah.

[00:07:10] **Stopa:** I feel like maybe

[00:07:10] **James:** that, maybe that's too brutally honest, but that's the truth. That's great.

[00:07:13] **Stopa:** No, that's, I feel like, at least for me, uh, that time, uh, definitely gave me a resolve. So, or an ability to.

[00:07:22] **Stopa:** Like, you know, if you're not already in the main crowd, it's okay to kinda like do your own thing.

[00:07:26] **James:** Yeah. I guess connecting it to, yeah. The reason we're here, or one of the reasons you probably all came was Yeah, because I felt like such an outsider when I was building the fire base culture. I knew what it was like to be an outsider and I wanted everyone to, to feel like they belonged.

[00:07:44] **James:** And I think inadvertently that created psychological safety, which a bunch of psychologists will tell you is like the most important for group cohesion.

[00:07:53] **Stopa:** Yeah.

[00:07:54] **James:** And so that's,

[00:07:57] **James:** that

[00:07:57] **James:** desire to create belonging and psychological safety, I think was one of the key reasons that Firebase succeeded. Um, we had a bunch of values and like one of them was, this is your happy place.

[00:08:08] **James:** Yeah. Which I wouldn't do again because I ended up being responsible for everyone else's happiness, which wasn't, which is the unintended second order effect. Checking note on that. Um. Um, but it, it's sort of like the, the repression, it worked really well in the short and medium term and the long term. It backfired a little bit, but the, the cohesion and the safety, uh, was directly born from that experience.

[00:08:33] **James:** Yeah. Moving countries at age 10.

[00:08:34] **Stopa:** Heck yeah. So you met Andrew right? In high school. So those kind of three years after, you're, you're in Minnesota for three years and the first year of high school you met Andrew.

[00:08:46] **James:** Yeah, so Minnesota, then back to England, then back to Minnesota. And I met Andrew on the second trip to Minnesota and we were in French class together in the 10th grade.

[00:08:55] **Stopa:** Wow. So what was the, what was your guys' first impressions of each other?

[00:09:00] **James:** He was, uh, so he was a gymnast and he would just like walk around the school. Everyone else would walk around the school on their feet and he would walk around the school on his hands.

[00:09:12] **Stopa:** What,

[00:09:13] **James:** so you'd just like see a pair of feet and a bunch of heads and they'd be like, oh, there's Andrew.

[00:09:17] **James:** Yeah. Um, he was, he was a diehard programmer. His father worked on one of the first CCRA supercomputers, so he had a bunch of computers in his house, and, uh, he like wrote this video game. Yeah. And he was so proud of it that he, it was in, I think it was in c and he printed off all of the code on like eight pages per sheet.

[00:09:40] **James:** And the printer. Yeah. And it was like 117 pages. Wow. Well, 117 sheets. So multiply that by eight and he'd just walk around with this like, wad of paper and be like, look what I made. Uh, so that was, that's Andrew.

[00:09:54] **Stopa:** Super cool. Did did you also get into, were you into programming at that time as well, or?

[00:10:00] **James:** I, I begged.

[00:10:02] **James:** So my dad was a software engineer. Mm-hmm. In the seventies, he, uh, worked for a bank called Barclays in the uk. Mm-hmm. And he, uh, coded on like punch cards. Wow. And so he, like, he was in, you know, programming and he'd moved up into management. Uh, but he brought home a computer for me, uh, when I was like five, four or five or something.

[00:10:24] **James:** And it was like an IBM 88 0 2, I think with like the five and a quarter inch. Wow. Floppies. Yeah. And like a bunch of games and like, it was dos and then Windows three, one, I'm old. Um, so yeah, I, I was like mucking about on Dawson, windows three one and then eventually Windows 95. Super Cool. Um, and then programming.

[00:10:46] **James:** Programming. Like I was scripting, like it was like a visual basic script kitty. And then I kind of, me too. Nice. I wanna like mic you for that. Uh, and then I got into actual programming when I was a teenager. Gotcha. And actually took some like computer science classes.

[00:11:04] **Stopa:** What, what bonded you and Andrew together initially?

[00:11:08] **Stopa:** Fire Poy. Fire Poy. Fire Poy.

[00:11:12] **James:** Oh, you guys, do you know what Poy is? I don't. So. Poi, uh, it's like you take it to raves. It's these, like on strings, they are these balls and you light 'em on fire and then you spin, spin 'em very fast. Oh, cool. Uh, and so he was super into fire, poi and then I got into fire. Poi Yeah.

[00:11:29] **James:** From him. And we'd fire point in weird had locations, we'd be like on top of the school and like the middle of the night, like fire pointing.

[00:11:37] **Stopa:** Um, were there other people fire pointing or it was just you two? It was, it was like us

[00:11:41] **James:** and a couple of other bra nerdy friends. Super cool. Yeah.

[00:11:45] **Stopa:** Okay. So then you, you, you graduate, right?

[00:11:48] **Stopa:** I did, yes. Nice. Thank you. And then you, and then you went to college? Originally to study psychology.

[00:11:57] **James:** I had no idea what I wanted to do. Yeah. Um, one of the things that scared me about England and the British system is they make you pick what you want to do when you're like 16.

[00:12:10] **Stopa:** Yeah. '

[00:12:11] **James:** cause the last two years of school you specialize.

[00:12:13] **James:** Um. I got to the end of college and even though I had a major in everything I didn't like, I knew I either wanted to be an entrepreneur or an actor. Those are like my two career choices, largely based on like, I saw my dad come home from work in corporate Britain and then corporate America miserable. And I was like, I don't wanna be him, so I'm gonna do like the thing that doesn't involve having a boss.

[00:12:34] **James:** Um, but yeah, so I show up to college and my first class was Psych 2 0 2. Mm-hmm. Which maybe is what you saw from some of your research. Yeah. And it was interesting. The professor showed up in like a three piece suit and then I was like, oh wow, this guy, this guy, wow. And then this was on a Tuesday and on a Thursday he showed up in like ripped jeans and like a white, like t-shirt with holes.

[00:13:01] **James:** And he was like, this does not matter because psychologically, like the vision of me in a three piece suit will be etched in your brain forever. And like, that's just how human psychology works. And so like first impressions are everything. And I was like, oh, I need to spend more time with this man. Yeah.

[00:13:16] **James:** Alright. This is some interesting wisdom. Um, but what, like, I, I looked at psych, I looked at, I took a bunch of computer science classes that first semester and like I was interested, like my personality is an interesting mix of like right brain and left brain. Like I love engineering and I have that kind of side of me and I love people and like, think I have some degree of intuitiveness or empathic ness mm-hmm.

[00:13:43] **James:** Or people orientedness and kinda like split the difference. My, my father is like very prototypically, like left brain engineer and my mother is like prototypically, right. Brained artist. Mm-hmm. And I like split the difference somewhere there. Um, and so, so yeah. Took a bunch of CS classes, but I, all my friends were out like partying on a Friday night.

[00:14:02] **James:** Like the University of Wisconsin is like known for. Drinking a lot. Um, alright. And academics, but a lot of drinking. And so I, I was out there like in the computer science lab, like searching for missing semicolons in my code. 'cause IDs were terrible in 2002, 2003. Yeah. And, uh, all my friends were partying and so I was like, that looks more fun.

[00:14:26] **James:** Uh, so I ended up, um, kind of the industrial and systems engineering is like somewhere between psychology and like, you know, cs. Um, and so I ended up going that route.

[00:14:39] **Stopa:** Gotcha, gotcha. It sounds to me like you kinda had the, the like classical reason to do college, which is just to kind of learn. I'm curious, if somebody was 18, would you recommend that path again for them to be like, Hey, like don't worry about, you know, this being extremely practical.

[00:14:59] **Stopa:** Like just do things that you enjoy. Like what, what, what would you tell an 18-year-old that's trying to choose a major.

[00:15:05] **James:** There's, there's two bits to university bit. One is mm-hmm. Well, three bits bit. One is like, what does the rest of society Yeah. Like, think of a degree.

[00:15:18] **Stopa:** Yeah.

[00:15:19] **James:** And in large part, like society views, degrees as like, can you get through a, like a fairly rigorous experience

[00:15:28] **Stopa:** mm-hmm.

[00:15:28] **Stopa:** And

[00:15:28] **James:** like if you're doing a stem, like how, how like quantitative and like logical is your thought process. And some of those bits, the other piece is like who you meet and how it shapes you as a person. Uh, and then the third bit is the actual skills and like what you learn. And

[00:15:47] **James:** as of right now, like society still thinks highly and ascribes mm-hmm. Like signaling value to a university degree.

[00:15:54] **Stopa:** Mm-hmm.

[00:15:55] **James:** Um, the skills thing I think is eroding pretty quickly. You can now like self-directed learn if, if you're an autodidact or. You know, if you learn well that way, I think there's, you can go much further faster without a university degree.

[00:16:10] **Stopa:** Yeah.

[00:16:10] **James:** Um, but I, I think that's not true of most people.

[00:16:13] **Stopa:** Mm-hmm.

[00:16:13] **James:** So for the average 18-year-old, like, like if you're clear, well, the other thing is like, who knows what the world's gonna look like in four years. Like we might be like in the singularity in four years. And like,

[00:16:27] **James:** so like you 18-year-old watching this, like, I don't wanna be responsible for your life choices. 'cause I don't know. So I might cop out and say like, I'm not entirely sure what advice I'd give 'cause it's an event horizon that like

[00:16:41] **Stopa:** mm-hmm. The whole

[00:16:42] **James:** world, let alone an 18-year-old isn't able to really look past.

[00:16:45] **Stopa:** Definitely. Definitely. Well,

[00:16:48] **James:** okay. In that case we go, sorry for giving you a non-answer.

[00:16:51] **Stopa:** No, I mean, I think that's a, that's a very good answer too. It's like, it is hard to know. It's hard to give somebody that critical advice. Uh, I'm curious then. Okay. You're 21. And then I, I read these things about like, you went to New Zealand to do like, like organic farming.

[00:17:08] **Stopa:** Like you, you went to New York to become, uh, an improv comedian. So normally when people graduate, they just like are in this competition to like, get a job. Right. What was your story? Why did you decide that you were gonna go to New Zealand?

[00:17:25] **James:** Y Yeah, so I, again, actor, entrepreneur. Yeah. So I, between junior and senior of college, I went to New York and studied acting.

[00:17:33] **James:** I was sick of engineering internships. Oh. So that, but that was that super. Mm-hmm. And then I, when I graduated, I interviewed at a bunch of places and they all seemed terrible. Uhhuh and I, it was kind of like you, you put the frog in the boiling water and it jumps right out.

[00:17:55] **Stopa:** Yeah.

[00:17:55] **James:** I, I got a job offer from a rotational program.

[00:17:58] **James:** I flew out to Silicon Valley and I got a job offer from a rotational program into it. And it was like six months Cs, six months marketing, six months biz dev. And like, it was like a fast track to leadership. And they, they gave me a job offer for like $62,000 a year, which in like 2007 money was like, and it was like a track.

[00:18:16] **James:** I would've, I was like, oh, this is stability. I like, my career is set if I take this. Yeah. And I just could not bring myself to do it.

[00:18:24] **Stopa:** Mm-hmm.

[00:18:25] **James:** There was just something in me that was like, n no, this isn't, like, this isn't the path.

[00:18:29] **Stopa:** Yeah.

[00:18:30] **James:** And it was agonizing too. 'cause I, like, I, I had no money, you know, it's like my bank account was somewhere between one and $400 for like, all of college.

[00:18:38] **James:** Um, so this was like more money than I'd ever like, dreamed of or imagined. And, um, yeah, it was, I don't know, like the Steve Jobs commencement speech, just like, follow your heart, follow your intuition. And that's, he hadn't given, actually he gave that speech like a year before, but I hadn't yet seen it. But yeah, that was.

[00:18:57] **James:** That was what I ended up doing. And, and I, instead of taking any job, I just, with my, my girlfriend at the time, like went, and she, she was super into organic farming and food systems and she was like, I'm going to New Zealand. They're like, work on an organic farm. And I was like, I'll go with you. Uh, and so that's, that's how that happened,

[00:19:17] **Stopa:** huh?

[00:19:18] **Stopa:** Was there anything, you know, uh, what kind of experiences out of like acting and that, uh, and I guess organic farming, do you feel like you've kept with you? Like is were there skills that you learned that you think, like most people don't learn because they just, you know, I I I can imagine being in front of like an audience and improv comedy must be very stressful.

[00:19:42] **Stopa:** So Yeah. What, what did you learn?

[00:19:44] **James:** Yeah. I mean, acting is, is very useful for presenting and communicating ideas and like getting things across to you and audience and like reading a room. Like, like PE people are a thing. Like they're your customers, they're your employees, they're your investors. They're like, yeah, like a And that is a transferrable skillset.

[00:20:09] **James:** Mm-hmm. And so that was, that was very, very useful. We used to do this exercise in acting called repetition, where you'd look at somebody and you'd just start with something obvious. You'd be like, you're wearing a blue shirt. And they would look at me and they'd say, you're wearing blue jeans. But eventually it'd be like, you're intrigued.

[00:20:31] **James:** Um, and you, you get to like read their emotional state. Mm-hmm. And then you'd, the crazy thing was you do a back to back not facing each other, and you can attune, oh, you can attune so deeply to another person that you can just like feel their like emotional state without looking at them. And those skills were like, you know, building the team, building, reading, the customers, doing sales.

[00:20:52] **James:** Mm-hmm. Fundraising, all of those things were like phenomenally. Wow. Organic farming. Lesser.

[00:20:59] **Stopa:** Gotcha. I am just one curious question on that time is, uh, like, what did your parents say? Like, you know, you, you have intuit on one side, you know, status, safety, goodness, and then you're just like, I'm, you know, I'm gonna go in this other path.

[00:21:15] **Stopa:** How, how, how did you convince first it's convincing yourself, but then there's also like people around you. What, what was the move?

[00:21:21] **James:** My god bless my parents. They were very just like, just go for it. Whatever, whatever you want to do.

[00:21:28] **Stopa:** Heck yeah. Like,

[00:21:29] **James:** it's your life. And they, they've never, they've never pushed me.

[00:21:33] **Stopa:** Yeah.

[00:21:33] **James:** They like pushed me to do well in school and they, you know, pushed me to say my pleases and thank yous and, you know. Yeah. But they, they've never had an opinion on my career. Super cool. I think there's a lot of self-imposed

[00:21:45] **Stopa:** mm-hmm.

[00:21:46] **James:** Wanting to prove myself to my dad. Yeah. Type stuff that I think boys and fathers tend to have.

[00:21:53] **James:** Fathers and sons tend to have, but, but Sure. Net was never given.

[00:21:56] **Stopa:** Mm-hmm.

[00:21:57] **James:** Any like explicit external, like you'll besmirch the family name if you go organic farm in New Zealand.

[00:22:08] **Stopa:** So then you come back from organic farming. What, what happens? What, what's, what's, what was on your mind at the time? Like how were you thinking?

[00:22:15] **James:** So, on my way out of the country Yeah. To go organic farm, I met up with Andrew. Ah, and I, like, if I wasn't going to join somebody, I was gonna like, start my own company, Uhhuh. And I was like, I'm gonna start my own company. And, and we randomly bumped into each other, like total random coincidence. He like, wow.

[00:22:36] **James:** I was dropping my stuff off after grad school. Mm-hmm. And he, um, just happened to be in the town that we could, you know, went to high school in and he called me and we met up and. And he was like, I'm gonna start a company. I was like, I'm gonna start a company. Like we should start a company together.

[00:22:50] **Stopa:** Wow.

[00:22:51] **Stopa:** Okay.

[00:22:52] **James:** Uh, and so I was like, um, hold that thought. I'm going organic farming in New Zealand. We'll meet up when I get back. And that's what happened.

[00:23:00] **Stopa:** Interesting. So I, I thought you had spent some time working and then you had to quit. But I, I actually, it was just, I guess it was the Intuit thing where you were like, okay, I wanna do that, but I gotta, I gotta get out.

[00:23:11] **Stopa:** Yeah. Yeah. Gotcha. So then you come back and I, I guess, was Andrew in, in Los Angeles at the time? Is that

[00:23:17] **James:** He was in Santa Barbara, so mm-hmm. Because I had done grad school and then done some traveling. He had worked for like 18 months

[00:23:24] **Stopa:** Gotcha.

[00:23:25] **James:** In Santa Barbara for a company called Greenhill Software, which builds real time operating systems.

[00:23:29] **James:** Um, and so yeah, he was living there. So yeah, I went there.

[00:23:33] **Stopa:** What made you think that Andrew would be a good co-founder for you?

[00:23:38] **James:** He was very smart. Mm-hmm. Um. Little did I know I was lucking into like a bajillion other like qualities that I had not yet considered. Yeah. Like he is as honest as the day is long.

[00:23:53] **James:** He is highly integral. He will not lie. Um, like he has your back no matter what. Like, and all of those, I guess I knew somewhere, but like hadn't put those in the front of my mind. Yeah. And uh, but like he's very smart and he knows how computers work better than I do. Was, was kind of the amazing, the initial thought.

[00:24:17] **Stopa:** And then did you guys just, did you just crash at his apartment? Was the, what was the first few months of like, okay, we're doing this?

[00:24:24] **James:** Yeah. So we, uh, I come back from traveling and we move into his house in Santa Barbara and we shared a room for the first year. Okay. Which was like two 23-year-old. So we went, we were like five years past freshman year at this juncture, but like.

[00:24:42] **James:** Uh, yeah, I, I, we shared a room. Amazing. I had amazing zero money 'cause I'd just blown it all traveling and I didn't have much to start with. And, uh, so I slept on a beanbag, uh, on his bedroom floor for a year. Well, like, wow. Like about five months. And then he took pity on me and bought me like a a hundred dollars mattress off Craigslist.

[00:25:05] **Stopa:** And Okay. Then why? So did Andrew, was Andrew still working for that first year or did you guys work? No, no, no. He,

[00:25:12] **James:** he quit.

[00:25:12] **Stopa:** You guys both quit. Yep. And you're free to go. Right. And the first startup idea, maybe, maybe you can tell us about it. Like how did that

[00:25:21] **James:** Yeah. So the very first start of idea he had was like a marketplace for experts.

[00:25:26] **Stopa:** Yeah.

[00:25:27] **James:** Which is like, if I want an expert in Python programming, I can like book them for like X dollars an hour and Yeah. You know, we'll connect you with them. And he was like, this is an I great idea. And I did like, you know. Four hours of market research. I'm like, here are the eight companies already doing this.

[00:25:44] **James:** And one of them was like, Skype at the time. And so he was like, ah, crap. But he'd already quit his job.

[00:25:50] **Stopa:** Yeah. He's

[00:25:50] **James:** like, it's fine. I got a second idea in the hopper. Let's do that one.

[00:25:55] **Stopa:** Okay.

[00:25:55] **James:** And it was to his credit? Yeah. It was prescient. It was touch, ID like for the iPhone in 2008. So the iPhone's about a year old.

[00:26:09] **James:** Yeah. And he's like, fingerprint sensor for the iPhone, reduced credit card fraud. Um, so that was the idea. Yeah. It's terrible for a number of reasons. Um, okay. But Apple ended up doing it and it turned out great for them. So, nice job. Apple.

[00:26:26] **Stopa:** You guys actually also built it, right? Like it was, you, you made something that worked.

[00:26:29] **James:** Yeah, we had, we, the icon phone had like a 30 pin connector at the time. Mm-hmm. And like. We had a fingerprint, we had a pro, we had one prototype. Let me play out. Alright.

[00:26:38] **Stopa:** Okay.

[00:26:38] **James:** Okay. Like with hardware building, the first thing is like, cool, good job. You built the first thing and then like, build 10,000 of those, then Yeah, it was a whole different thing.

[00:26:47] **James:** Uh, so we built the first one. Yeah. And we had like a, we had a fingerprint sensor hooked up to a dongle. I, like, we catted the whole thing out and like

[00:26:54] **Stopa:** Yeah.

[00:26:55] **James:** You know, 3D printing and housing, the fingerprint sensor. And we went and like, talked to like visa and I like, again, 23-year-old, nobody like in our living room.

[00:27:08] **James:** And I was like emailing the vice president of Amex, be like, dear sir, uh, and got the call, like, to my credit at the time, heck, I'll pat myself on the back, like got calls with like, we, we spoke to like the president of Discover and the vice president of Amex and like all these people and um, B basically there's a, yeah.

[00:27:28] **James:** Besides the usability issues. Yeah. There's like technical issues. Round trip when you like, I guess now Apple Pay or Google Pay at a point of sale, it has to go from your phone to the terminal, to the merchant bank, to your bank, to your account, and then back across the network. Yeah. Like Visa, MasterCard, amex, discover Network, like back to the terminal in seven seconds.

[00:27:56] **James:** Gotcha. And otherwise it times out. Yeah. And we were like, uh, seven seconds is a good user experience to like pull your phone out and like plug in the don and like author. Uh, and they were, they were unwilling to like Yeah. Move the, the, the timeout limit higher. Mostly because like store, I don't know if you care about any of this, but we care, like grocery stores, et cetera, really care about like throughput of customers Yeah.

[00:28:21] **James:** Through their checkout lines. Yeah. And so there's, there's like pressure on the merchant side. Um, and, and as a result, like they, they weren't willing to Gotcha. To move anyway, so that's. That's a very long-winded description of my first failed startup that could about four months to fail.

[00:28:39] **Stopa:** Well, four months.

[00:28:40] **Stopa:** Okay. So I just wanna understand, uh, like what made you decide to switch, right? What was the, you're like, okay, was it this, you were just like, ah, man, the we can't get, these are, these customers are too big.

[00:28:52] **James:** Yeah. Like the, the card networks just like, wouldn't move. Yeah. So we were like, ah, well it's not gonna work that

[00:28:58] **Stopa:** way.

[00:28:59] **James:** Yeah.

[00:28:59] **Stopa:** Alright. Okay. So then, then you guys pivot into social media for things, right? Yes, we did. Tell me the beginning of that. I'm just curious. Like, so

[00:29:09] **James:** let me picture, picture a vision. Social media for things. Alright. Um, we, so I have a little bit of a, um, what's the word? U utopian or idealistic mm-hmm.

[00:29:26] **James:** Streak in me. Yeah. Or like, I, I try and. I, I have a, an inclination to do things that like net benefit

[00:29:37] **Stopa:** mm-hmm. Like

[00:29:37] **James:** society and have a social change. Yeah. So this was one of my hair-brained ideas. Um, but basically,

[00:29:50] **James:** so, so Facebook has profile pictures of profile pages of people and we built a social network that had a profile picture or page of, like a place or an object and people could collaboratively tell the story of those things.

[00:30:07] **Stopa:** Yeah.

[00:30:08] **James:** So, you know, your apartment passes, you move out of it and somebody else moves in and, you know, you can like see the provenance or the history of a thing.

[00:30:18] **Stopa:** Yeah.

[00:30:19] **James:** Um, we had like, uh, a little statue of an Easter island head and it went to Mardi Gras New Orleans, and it went to Barack Obama's 2008 inauguration and it went to the Great Wall of China. And people would just like pass it from person to person and like collectively tell the story of the thing. Um, and we had like, is like, one, one of the coolest things was we had like Israelis and Palestinians, there was like a book club.

[00:30:46] **James:** Yeah. And like somebody would read a book and like, you know, hand it off to somebody else, like Israeli would be a book and hand it off to a Palestinian and it was like a, like a running book club. Um, super cool. And so it was like, I guess humans connecting around something that is not a part of your identity.

[00:31:04] **James:** Mm-hmm. Like we, we have like really strong ego casings and it's like, this is me and this is not me. And whatever's not me is scary and whatever. Me is good. And like, this all happens at a subconscious level, but if you have something external to you that is not yet connected to your identity

[00:31:19] **Stopa:** Yeah.

[00:31:20] **James:** It, it, it has like zero emotional valence and so it's easy to like find commonality.

[00:31:26] **James:** Yeah. Um, with another person through that. So. Um, I, so that's so social media for

[00:31:33] **Stopa:** things. Wait, you know, I just, I wanna pause and say it did kind of work, like you guys, you guys exploded a little bit, right?

[00:31:40] **James:** No. Alright. Wait, we, we got a d we got like 6,000 users and we made like $92.

[00:31:48] **Stopa:** That's pretty good in my book.

[00:31:49] **Stopa:** 6,000 users. Okay. So, so then what, what did you learn? What did you learn doing that?

[00:31:55] **James:** Um, I learned that people care way more about other people than things.

[00:31:59] **Stopa:** Mm-hmm.

[00:32:01] **James:** Um, I learned how to write Java. Alright. Uh, I learned,

[00:32:13] **James:** I learned that Andrew is a very patient teacher of Java. I learned, I, I guess I learned, I, I, from both of those experiences, I learned what failure

[00:32:23] **Stopa:** mm-hmm.

[00:32:24] **James:** Felt like with, with Andrew. Mm-hmm. Um. I think I learned like he was excited about the first idea and I was excited about the second idea. And we went through the whole rollercoaster of like, yeah, yay.

[00:32:39] **James:** Ow. Um, what else did I learn? Oh, we,

[00:32:49] **James:** ah, yeah. Yeah. That's what I learned. James.

[00:32:51] **Stopa:** Oh man, you gotta tell us James. What, what, what was the other one?

[00:32:55] **James:** Uh, I guess I, I learned how like, insane the rest of the world is Uhhuh, like we ran outta money after the second company, Uhhuh. And um, so we, we went and got like consulting jobs, Uhhuh and our first day on the consulting job.

[00:33:11] **James:** Yeah. This guy picked us up. Yeah. In A BMW, like five series Uhhuh leather seats, tinted windows. And like Andrew had met him through something or other.

[00:33:23] **Stopa:** Mm-hmm.

[00:33:24] **James:** And he's like, we, we, I'm taking you. To the, the client and like, it's gonna be great. Yeah. And so he picked us up in Santa Barbara where he lived as well.

[00:33:35] **James:** And he drove us down to like Thousand Oaks, which is North La Uhhuh. And

[00:33:42] **James:** in the car on the way there, he's like, by the way, the thing you are working on, it's a month late. And I've told them, I've got my crack team on it and you are the crack team.

[00:33:57] **James:** And so like, we drove down to this office and it was a supplement company.

[00:34:02] **Stopa:** Yeah.

[00:34:03] **James:** And their COO was the world's strongest man. He was like this, nor this o Norwegian guy called Ode. It's spelled ODD. And we showed up there and just like mounted of a man was there and like the, the guy who had taken this there was getting yelled at.

[00:34:21] **James:** We were like sitting in a conference room, just like, what is going on? But he paid us $50 an hour. Nice.

[00:34:27] **Stopa:** Which was

[00:34:27] **James:** like, oh my God. And we, you know, we had no money. We were living off harm and like, um, so we put up with it, uh, anyway. Wow. I don't know what the lesson is there, but

[00:34:42] **Stopa:** maybe it's a good, you know, like, you know what, back to the startup, you know?

[00:34:45] **Stopa:** Yeah, yeah. What, you know, I, I have two kind of questions about that early startup time. One of them is how did you, you know, when you don't have that many customers and it's just the co-founders, uh, sometimes it's just easy to like, basically become on unemployed. You know, you're like not actually working on stuff.

[00:35:05] **Stopa:** Like how did you, what was the day-to-day work like? Like, did you guys wake up at nine, sit together in the, in, in that one room? Or like, what, what was the kind of structure?

[00:35:17] **James:** Um, so, so the, I guess there's two questions. What's the structure and what was the motivation?

[00:35:21] **Stopa:** Yeah. Like how did you make sure that stuff got. When you had no users as a, as a way to like force you to get it done and no external pressure outside of just YouTube.

[00:35:31] **James:** I think we were intrinsically motivated.

[00:35:33] **James:** Yeah. And then when you are paired with Yeah. Somebody who's intrinsically motivated, you push each other. Yeah. I mean, I'm sure you experienced this with Joe. Did you guys have structure like

[00:35:42] **Stopa:** wake up at nine, finish it or, or

[00:35:45] **James:** No, we, we, there was, there was a period of three weeks where, and I don't mean to glamorize this, like I don't actually think you should do what I'm about to say, Uhhuh.

[00:35:54] **James:** Um, but we, there was a period of three weeks where like you could go into the office at 24 hours a day and one of us would've been there working. Wow. Okay. So like, and I ended up doing this like progressively later schedule. So I go to bed at midnight one night, and the next night, 2:00 AM and the next night, 4:00 AM and the next night 6:00 AM And I just like wrap around.

[00:36:13] **James:** Yeah. So we were, we were like, there was like a level of desperation to get this thing to work. Yeah. Um, and as a result we worked. Really hard. And we, I mean, our back was to the war, right? Yeah. We had no money. And Andrew wouldn't mind me saying this, but he lost all of our investment capital in the great financial crisis.

[00:36:32] **James:** Uhhuh, uh, that's our, that's another story. Love you Andrew. Um, uh, so yeah, we, we, like our backs were up against the wall and we really wanted to make it work and we didn't, you know, I had this like

[00:36:46] **Stopa:** Yeah.

[00:36:47] **James:** Fear of getting a real job and so I was like, no, we're good. Like, you know, gonna do this.

[00:36:54] **Stopa:** Was there ever, was there ever like a moment where like, we can't do it, and then what, what made you say, okay, no, no, no, that's wrong.

[00:36:59] **Stopa:** I'm gonna get back to it.

[00:37:03] **James:** There were, yes, there were like three moments that I think, yeah. Um, we almost gave up. Mm-hmm. Um.

[00:37:17] **James:** Well, I almost gave up. Mm-hmm. Uh, one was we, we moved up to the bay from Santa Barbara after the, the social media for things company. Okay. And we lived with Andrew's aunt and uncle out in Orinda. And we had a startup, like a, a, an office like a couple of blocks from here. Wow. And we'd, like, Andrew's aunt and uncle would drop us off at the BART station when they took their kids to school in the morning.

[00:37:42] **James:** And we would take the BART in and walk like the mile to the office and we'd work all day. Yeah. And we'd like walk the mile back to Bart and we'd get on Bart, the last train, 1225 from Montgomery Station. We'd like get the train out to Orinda and then we'd walk like two and a half miles back to his aunt and uncle's house.

[00:37:59] **James:** Wow. And get there at like, you know, one 30. And then I'd get like, like again, both of us sleeping in the same room like. Me on a mattress on the floor. Yeah. And I like, we did that for like a couple of months. I was like, what am I doing with my life?

[00:38:15] **Stopa:** Yeah.

[00:38:15] **James:** Uh, and so that was definitely a low point.

[00:38:18] **Stopa:** Mm-hmm.

[00:38:19] **James:** And there were, there were a couple of others that were like, you know, the third, the third company failed as well. Didn't go the way we wanted it. And, you know, I, I was, you know, I'd been doing this for like three years and had nothing to show for it. Mm-hmm. And I think it was like, you know, age 22, 23 through 26.

[00:38:35] **Stopa:** Mm-hmm.

[00:38:35] **James:** You know, and again, like most of my peer group is out, like, you know, working Yeah. Jobs that pay them money so they can have fun on the weekends. And we were like coding and, um, yeah. So it, you know, it was, yeah. I, like, I would've done things a lot different. I would've applied to yc mm-hmm. Uh, earlier and I would've gotten help earlier.

[00:38:57] **James:** Yeah. And I think we, we just like wandered around in a dark room learning a bunch of lessons, way too hard. And we didn't Yeah. Wouldn't need to do that. And it was. It was taxing and Yeah. Yeah. Like I would wish, I would not wish that on anyone. Yeah. It was very difficult and like, you know, like naive and stupid.

[00:39:16] **James:** Mm-hmm. And like, yeah. So like, I don't know, like the only one of the good things to come out of it was, it like cemented

[00:39:25] **Stopa:** the

[00:39:25] **James:** relationship between Andrew and I. Yeah. Um, and I like, yeah, I, I knew the kind of person he was after going through such difficulty, but it was, you know, it was, it was probably not the, the greatest use of time.

[00:39:37] **Stopa:** What do you think, you know, here, here's a question just about that initial co foundership too. Like what do you think made it so you guys got even stronger together and the, the, you know, the friendship got even better and, and uh, you know, if you were advising a co-founder team to make sure that the co foundership lasts like a lifetime, what would be your advice from the, that part of your journey?

[00:40:07] **James:** Yeah, I mean, pick, picking is important, like who you choose to do this with. Mm-hmm. Um, there's like, there's a bunch of raw ingredients that are like, yeah. Need to be there. Um, and then like a healthy dose of shared adverse experience. Yeah. Bonds, like nothing else. Um, really good, honest, direct communication.

[00:40:33] **Stopa:** Mm-hmm.

[00:40:35] **James:** Um, really helps, uh, I guess just like there's, there's like a time component to it, like trust is built over time.

[00:40:43] **Stopa:** Yeah.

[00:40:44] **James:** Um, and

[00:40:55] **James:** what else would I say? I mean, I like a co like a complimentary skill sets are certainly useful. Yeah. Um, I think Andrew, Andrew is like just a brilliant engineer and I'm like a mediocre engineer who's like exceptional on the people side of things. Mm-hmm.

[00:41:16] **Stopa:** And

[00:41:16] **James:** so I think we complimented each other really well there.

[00:41:19] **James:** Super cool. Um, what else have, have the hard conversations up front? Like if this fails, like do a pre-mortem? Yeah. Like, if this fails, why is it gonna fail? Yeah. Like, I think we both demonstrated investment

[00:41:35] **Stopa:** mm-hmm.

[00:41:35] **James:** To each other. Um, with, with how, with time and money. Yeah. Um, so there was, there was like a, we each had like an equal amount of skin in the game, which was, which was really useful.

[00:41:49] **James:** Um, like if it failed, it was equally bad for both of us. Yeah. Uh. If, if it, if that's asymmetric, like things can get

[00:41:59] **Stopa:** weird. Mm-hmm.

[00:42:00] **James:** Uh, what else?

[00:42:07] **James:** Mid Midwesterners tend to be pretty great human beings. Aw.

[00:42:13] **Stopa:** We have a few Midwesterners in the audience. I think so.

[00:42:16] **James:** High Midwestern. It's cold. It is cold.

[00:42:21] **Stopa:** It's a little cold.

[00:42:22] **James:** Where in the Midwest, Missouri is not that cold. Nice.

[00:42:26] **Stopa:** Yeah. So, okay. This goes on, right. And the way I, I heard it in the official narrative, so I'm curious if this is how it happened is while you guys were doing the social network, you realize that chat is what needs to happen, and that's how the third company got created.

[00:42:41] **Stopa:** Was, was that kind of how it happened or was it different? Like what, so you're, you're in, or Orinda, right? You're coming into the office. This third, this one's not working. So you guys moved to this third startup. What was that like? How did you, how did that idea come in? And you with that one you guys went to to yc, right?

[00:42:57] **Stopa:** So yeah, like I'd like to hear the story of it.

[00:43:00] **James:** Yeah, it's, it was, so we worked in that one for two years. Oh, wow. Okay. Before we got into yc. Um, so it was like a year for the first two. Yeah. And then two years on the next one and Yeah, you're right. So the social network, I was like, social network needs chat.

[00:43:16] **James:** Yeah. Because we, I like the relationship thing and like relationships are better done synchronously. Yeah. So chat and Facebook chat had just come out and we were like, Facebook chat for everything and that's where that came from. And we got, we ended up getting to like 128,000 websites. Like Wow. Ricky Martin and Limp Bizkit and all these musician fan sites and forums and yeah.

[00:43:36] **James:** Um, and do you want me to just like, skip how that became, turned into that to fire base? You

[00:43:42] **Stopa:** know what, we we're 30 people together. We'll figure it out. If the time goes over, it goes over. Okay. So let's, let's, let's talk about it. I'm, I'm just curious. So, so the one, the question I have there is. So to just give people the background, the way I understand it is it's this chat API basically.

[00:44:00] **Stopa:** Uh, but now you're saying it's a hundred thousand people. Right. And there was like a switch. Right. So how did that, uh, how did that switch happen? Like, you know, it's kind of, there's some product market fit here. So how, how did that happen

[00:44:15] **James:** from, from social network to chat or chat to Firebase? Chat to Firebase?

[00:44:20] **James:** Chat to Firebase was, um,

[00:44:26] **James:** basically all of our biggest customers. Yeah. For the chat wanted customers, Uhhuh. So our gaming customers were like, I want it in this diviv here and I want this color and I want it to look like this. And ultimately programming is just like unlimited expression of choice.

[00:44:43] **Stopa:** Yeah.

[00:44:45] **James:** Um, and we were trying to like give you course grain choice and that's not what the biggest customers wanted.

[00:44:49] **James:** So we just kind of followed the money. And then there was this insight, Andrew called me. I was at a party, it was like 2:00 AM on a Friday. Wow. I was actually at over in like Debo Triangle. I remember it very clearly. Yeah. And he calls me at like 2:00 AM and he's like, I have this brilliant idea. He's like, we can, you know, take the infrastructure we have for the chat.

[00:45:08] **James:** Yeah. And expose it as an API, but like it can be used for way more than chat. Super cool. And I was like, yeah, whatever, Andrew, you are drunk. I'm drunk. Like, let's, yeah, let's talk about this in the morning. And it turned out to be, you know, it's turned out to be like a key insight and you know, but like we inadvertently found ourselves kind of at the, the mega trend of this whole front end becomes a thing like browsers become powerful, phones become powerful.

[00:45:39] **James:** They can run code on the client instead of like, the web was built by, you know, a client asks a server, Hey, gimme a thing, and the server gives it a thing. It was not built for a server to say like. Like, Hey, do this. And so you'd like, we've hacked it with like long polling and mm-hmm. And all these other things.

[00:45:59] **James:** And we, Facebook had done this. Google had done this with Google Docs, but like nobody else had figured out this real time thing.

[00:46:05] **Stopa:** Yeah.

[00:46:05] **James:** And it was clear, like user, user experience tends to drive like a lot of downstream things, and that's users were coming to demand it. You guys remember pull to refresh when that was a thing.

[00:46:16] **James:** Like that's, that's all been replaced now. And so this real time thing slash mobile and, you know, cloud compute and we, we just like happened to like, you know, I, I wish I could say it was like a grand stroke of genius, but it was like bumping around until we like landed in the right spot and then had enough wherewithal to realize that this was amazing and then just like tripled down on it.

[00:46:41] **James:** Interesting.

[00:46:42] **Stopa:** And then when that was happening, did you, 'cause was it like a full pivot where you were like, we're just stopping the other thing or the other thing was running and then. You guys said, okay, well let's just kind of expand that to what becomes Firebase like. What was the, the transition?

[00:46:56] **James:** Yeah.

[00:46:56] **James:** We were doing yc. Yeah. Um, and kind of during the period of yc we had this insight. Yeah. And then it came to demo day and um, Gary Tan, who was our design partner, we went to Gary and we were like, Gary, what should we do? And Gary was like, do the chat. Like that's got users that's got, you know, pitch the chat thing.

[00:47:21] **James:** Yeah. Um, love you Gary. And so we, yeah, we went up on stage for demo day and we, like, we pitched vol and you can find my, my demo day pitch is out there on the internet somewhere. Whoa. And uh, um, I went and spoke to 52 investors. Mm-hmm. Uh, after demo day, and two of them said yes. One of them was our landlord.

[00:47:43] **James:** Uh, he was like, why are you guys here until two a one? Yeah. Whatever the last train was every night like, yeah, yeah. Take my money. I don't even know what you're doing. Just like, have some money. And the other was, uh, an alumni from my university who ran like a, an alumni group, and he was just like, I just wanna support you guys.

[00:48:01] **James:** Super cool. And, uh, I've lost my train of thought. Help me put it back on the tracks please. So,

[00:48:12] **Stopa:** uh, the, the, the question was about moving, like that, that pivot transition. So you launched as Evolve, right? You did the demo day as evolve, but you knew you wanted to do Firebase. Oh, right,

[00:48:24] **James:** right, right. Yeah. Yeah.

[00:48:25] **James:** So we like, eventually after pitching everyone

[00:48:28] **Stopa:** Yeah.

[00:48:28] **James:** It, like, it was clear, everyone was like, this chat thing is cute, but it's not venture backable. Gotcha. And so at that point in time, we're like, all right, we're, we're gonna, we're gonna do this platform thing, which was called plankton at the time. It was code named plankton.

[00:48:42] **James:** Wow. Um, glad we changed that. Um. And this was another one of those points where I was like, yeah, I don't know if I want to do this. Yeah. It's been three years and it was, I was just, you know, I was exhausted and I was the, the, the thought of like,

[00:49:02] **Stopa:** yeah,

[00:49:03] **James:** doing another thing after three failures was daunting.

[00:49:06] **Stopa:** Yeah.

[00:49:07] **James:** Um, but we had, we had Andrew and we had our first employee Vikram. Yeah. Um, who was just a real like, injection of like fun and levity and awesomeness and, you know, he joined and like six weeks later it was like, we're pivoting. And he was like, cool.

[00:49:25] **Stopa:** Aw. So

[00:49:25] **James:** that's a testament to him and how awesome he is.

[00:49:28] **James:** And so we had, we had a little bit of like, fresh freshness to the team and

[00:49:32] **Stopa:** Yeah.

[00:49:33] **James:** Um, I was like, we are here. Like, all right, let's like one more, like one more all and we'll do it.

[00:49:40] **Stopa:** So what I, what I heard right, was there's this eight months that you guys are kind of like. You pick this core group of users, right?

[00:49:48] **Stopa:** And you're iterating what, what becomes firebase? So like what was the, I'm just curious if we just get concrete about that. Like what was the very first usable thing that you guys shipped to somebody and then what did like, iterating on that look like?

[00:50:03] **James:** Yeah. So the first, the very first thing we had is like adjacent object that sinks.

[00:50:09] **James:** Yeah. That was, that was the whole thing. Yeah. And um, I think our, like we had, we had a bunch of, the very first thing we had was a game of Tetris.

[00:50:21] **Stopa:** Yeah.

[00:50:22] **James:** Um, that our second employee built. Yeah. He built this like real time Tetris between two browsers.

[00:50:27] **Stopa:** Yeah.

[00:50:27] **James:** Um, that was the first internal prototype that ever got built.

[00:50:31] **Stopa:** Yeah.

[00:50:32] **James:** And then the, I think the second thing was like a shared mouse pointer

[00:50:37] **Stopa:** mm-hmm.

[00:50:37] **James:** Thing, um, built by an external user. And I think the first real application application. Was a friend of mine, Smit built a thing called Smits Crew, which she used to organize like her social life going out in San Francisco.

[00:50:53] **James:** Wow. On like the weekends. And it was like this thing, you could sign up and it'd tell you where they were going and what they were doing. And it was like smith's crew.org or something like that.

[00:51:03] **Stopa:** So. So, okay. So what was, walk me through like that experience of like what, what did, what did they teach you through this where you think Firebase became so explosive afterwards?

[00:51:16] **Stopa:** Like would you say it was just this and you guys share it with the world and the world just picked it up or, yeah. Like how was that, that eight months to like 11 months kind of transition?

[00:51:30] **James:** So we, unlike the first three companies where Andrew and I thought we were

[00:51:38] **Stopa:** very

[00:51:39] **James:** intelligent and. We knew what to build, we backed way up and we were like, assume we know nothing.

[00:51:47] **James:** Yeah. Because it has been proven three times that we don't.

[00:51:51] **Stopa:** Yeah.

[00:51:52] **James:** And okay, so yeah, we took this very like, methodical approach, you know, the, the talk to users thing that we spoke about the beginning. Yeah. Like we, we really over indexed on that.

[00:52:04] **Stopa:** Mm-hmm.

[00:52:05] **James:** And, you know, we had an office again, a couple blocks away, and just like almost daily we'd be bringing people in, be like, can you build something with this?

[00:52:14] **James:** Yeah. What do you think of this? API like, do do this particular task and we'd like videotape everything. And we'd have a, you know, we'd have a script and we'd run people through the script and um, you know, we'd take meticulous notes and then we'd go back and iterate and just like that continuous iteration cycle over the product surface was kind of where.

[00:52:36] **James:** Like what we did for a while. And then after that we started going to hackathons and just like turning people loose. Yeah. It's like build what you want to build.

[00:52:45] **Stopa:** Yeah.

[00:52:46] **James:** And we'd show up to hackathons with, you know, all four of us in these blaze yellow shirts and you could look around a room and like find the fire base and we'd help people whether they were using Firebase or not.

[00:52:58] **James:** But like, you know, the, I think the first couple hackathons, you know, of the 10 finalists, like eight of them would use Firebase and we were like, oh, okay. Maybe there's something here.

[00:53:10] **Stopa:** I have one curious question on the marketing. When you guys were doing this, like one trouble, when you're just at this point, you guys are just like four people, right?

[00:53:18] **Stopa:** Anytime you go to a hackathon, like the product doesn't, like you can't code at the same time. So what, why, what would you guys, how did you guys make sure that the product was moving forward and you were doing this kind of marketing stuff? I

[00:53:32] **James:** mean, the hackathons were on the weekends, so we just worked on the weekends, is the short answer.

[00:53:37] **Stopa:** Okay. That's, that's a, that's a good answer. Yeah. Alright, so then you guys, you, you guys launched this. Um, one other Chris curious question I have on marketing is, there's some stuff that helps directly, right? Like, I guess with, uh, with the hackathon, you just see the users go up, but with certain things you, you might not see it.

[00:53:59] **Stopa:** Like maybe you had like a pizza gathering or something. What, how, how did you think about like the intangible marketing and the tangible marketing? Like was everything you guys did tangible marketing? Do, do you see what I'm saying? Like how did you think about that?

[00:54:14] **James:** Yeah, so when you're building community

[00:54:17] **Stopa:** Yeah.

[00:54:17] **James:** Like communities grow from seed crystals.

[00:54:20] **Stopa:** Mm-hmm.

[00:54:20] **James:** And like in the same way the company cultures grow from seed crystals or countries grow from seed crystals and like Yeah. The initial conditions. That you create for that matter a lot.

[00:54:32] **Stopa:** Yeah.

[00:54:32] **James:** Because like, everything downstream comes from that sea crystal.

[00:54:36] **James:** And if you take a, like a transactional approach

[00:54:40] **Stopa:** mm-hmm.

[00:54:41] **James:** To building community, like you're in for a bad time.

[00:54:45] **Stopa:** Mm-hmm.

[00:54:46] **James:** And so everything we did was like human first. Mm-hmm. So this is why we helped people at hackathons, even if they were building, not using firebase. Yeah. Because it's a How do, how do people feel about you?

[00:55:01] **James:** Like, like this, you know, big companies talk about brand, it's like the brand promise of Coca-Cola is blank. And it's like, because humans are so good at anthropomorphizing

[00:55:12] **Stopa:** Yeah. Onto

[00:55:12] **James:** everything. Like there can be this like, artificial brand promise, but it's a, it's at a level of indirection that like, and a level of scale that is dehumanizing.

[00:55:21] **James:** But when you're at a. When you're at such small scale, you can afford to be human, and in fact, you can and should, especially in a technical

[00:55:29] **Stopa:** mm-hmm.

[00:55:30] **James:** Product where like, you know, the user is not everyone in the world. It was like, there was like five or 6 million developers back when we started. Wow. Um, so we could afford to do that.

[00:55:39] **James:** So it was like, like our first employee just put on our website, unbeknownst to us like five A has office hours from three to five every Friday in Soma. Like, come stop by. And like, I didn't know this. And then just like Friday at three o'clock rolled around and like, a bunch of people showed up at our door and they were like, Hey, we're here for the office hours.

[00:55:56] **James:** I was like, what? Um, and so that's kind of the level of, you know, we, we hosted, you know, pizza nights and, you know, gave people a bunch of free beer and, um, you know, we went to like the local JavaScript meetups and, you know, we, we did all this in-person stuff.

[00:56:15] **Stopa:** Yeah.

[00:56:15] **James:** Um, you know, we really prioritized support.

[00:56:17] **James:** We held the hands of our early users. We got our early users together in groups. The care and the relationships that come from that. And because developers are such a, such dense networks, like, because it takes such time to get good at a technology, like on people's resume, you're getting more time signals FYI to get on people's resumes.

[00:56:42] **James:** Um, and to say I'm a fire based developer. I'm a yeah, a MySQL developer, like that takes investment and people, people are only gonna recommend, Hey, you should use this piece of technology like with a degree of weight. Mm-hmm. And if it, they think it's worth that, that investment and the proxy for should I, should I invest my time in this?

[00:57:08] **James:** Is like, who are the people?

[00:57:10] **Stopa:** Yeah.

[00:57:10] **James:** And so if you answer that first question, then you know, the, the answer to the second becomes easier stomach.

[00:57:16] **Stopa:** Very interesting. Very interesting. I think that does. It kind of makes sense to me because I think like when you do that with the core group, then the core group helps the other groups and then like as you grow, the culture kind of just continues on.

[00:57:31] **Stopa:** Totally.

[00:57:32] **Stopa:** I have a question on the team. Like, you know, I've, I've, I've heard, you know, you, you mentioned this idea of like, it's everybody's happy place, right? How did you, if you were to advise somebody else to, like, how do you build a really good team and then how do you make sure everyone's happy? And then how do you make sure you don't get burned out?

[00:57:49] **Stopa:** Like, what would be your advice to that?

[00:57:54] **James:** Uh, oh man. I mean, there's like an hour of content right here.

[00:57:58] **Stopa:** Yeah.

[00:57:59] **James:** Uh, I mean, it's kind, it's kind of the same thing I said for the co-founder. It's like, pick, pick. Well, yes, my first pass filter was friendly, smart, and motivated. Yeah. Um, 'cause you can't, like, you, those tend to be generally fixed qualities.

[00:58:15] **James:** Yeah. Um, I guess motivation depends like. Uh, yeah. Yeah. So the, the friendly, smart and motivated thing was my first pass. Um, the, I, I think we, we set expectations, like on day one it was like, Hey, what are your expectations for us? And here are our expectations for you.

[00:58:40] **Stopa:** Yeah.

[00:58:41] **James:** Um, we had a bunch of traditions, like groups, groups of people, whether they're, you know, at any level of society, like traditions and rituals, like bind you.

[00:58:54] **James:** And so we had a bunch of traditions and rituals. Um, you know, we ate lunch together every day as, as a, uh, a team. You have a pineapple here for a reason, I'm guessing. Uh, uh, we, we had to bring a pineapple to Workday. Um, you know, we, we, we had a cadence where everyone knew what was going on. Um, like we, we did like three, two week sprints and then.

[00:59:17] **James:** After that sixth week, we did like a seventh week of like, unstructured time. Yeah. Where you could like, build whatever you want. That wasn't on the roadmap or hadn't been prioritized by us, and some of our best features came from that. So like a sense of autonomy mm-hmm. Was encoded in that. Um, yeah. I mean, I, I can go on for hours and hours on

[00:59:38] **Stopa:** this.

[00:59:38] **Stopa:** So I have one, one question. I I, I know we're tight, so I'm gonna fly through some stuff, but one question I have is just about product market fit. Where would you say for Firebase, you felt it right away?

[00:59:52] **James:** Yes.

[00:59:53] **Stopa:** Yes. Okay. And then once you had it, how were you chasing it? Like, were you, were you just, was it just constantly just reacting to what users wanted?

[01:00:02] **Stopa:** Or, or, you know, how did you make basically plans? Like, was it, was it purely like, just what do users want? Let's just ship it. We're constantly like trying to keep it alive. Or was it, here's where we're taking it. Like what was. This, you know, how did you guys just make plans?

[01:00:18] **James:** I think you need to have both.

[01:00:20] **James:** Yeah. Like we had a top down, like we wanna build the simplest to understand and the easiest to use platform for building apps.

[01:00:27] **Stopa:** Yeah.

[01:00:28] **James:** And then with that North Star, it was just like, oh gosh, what do users one? Yeah. Like we shipped, we shipped the thing like without like an account system. Like we just like give you an onboarding and you get to like a playground that just had A-A-U-R-L like security through obscurity type thing.

[01:00:47] **Stopa:** Yeah.

[01:00:48] **James:** So like, that's the level of speed we were working with.

[01:00:51] **Stopa:** Wow. Super cool. Alright. You get, you get acquired by Google. Let's, we gotta, we gotta move, move in this, uh, what, what did you learn moving into Google? What was the good things you got out of it? Curious.

[01:01:08] **James:** Google has a great written culture like. In order to operate at that scale, like everything needs to be written down like very precisely and communicated asynchronously.

[01:01:17] **Stopa:** Yeah.

[01:01:18] **James:** So, um, Google has this mindset of what does this look like at scale? Like, how, how do we, IM impact and influence more people. And so that, that DNA was really useful. Um, as much as you wanna laugh for Googs, there is like a well-meaning like, I think I only ran into one person who was malicious at Google.

[01:01:38] **Stopa:** Mm-hmm. And

[01:01:38] **James:** they, their hiring bar is excellent or, or was. Yeah. Um, I, I still think I, I can't comment on it now, but mm-hmm. I think the culture's changed a little bit. Um,

[01:01:54] **James:** just the, the, yeah. The caliber of engineering there is is amazing. Amazing, amazing. Like, they built some of the most incredible technical systems. You know, like you can look at a skyscraper Yeah. And be like, holy crap, humans did that. The Google infrastructure and search infrastructure is like same thing, just in code.

[01:02:14] **James:** Wow. It's, it's remarkable.

[01:02:16] **Stopa:** If you had to give yourself at that time advice, what would you tell 'em?

[01:02:22] **James:** Going into Google?

[01:02:22] **Stopa:** Yeah.

[01:02:26] **James:** I don't think I got the memo that the company wasn't mine anymore.

[01:02:30] **Stopa:** Mm-hmm.

[01:02:32] **James:** Like, yeah. I just,

[01:02:36] **James:** yeah. I kept acting like I was the CEO when I wasn't. Mm-hmm. And there was a bunch of friction points there that wore me down. Mm-hmm. And it was, it was like I had two choices. I could have gone there and just like been a cog and done what I was. You kind of, I, I understood what it was like to be inside a big system.

[01:03:07] **Stopa:** Mm-hmm.

[01:03:08] **James:** And inside big systems, like there are these niches and it's like, I am a PM level 7.5, and like this is what my job description is. And like that, like it doesn't map well on the startup founder.

[01:03:21] **Stopa:** Yeah.

[01:03:22] **James:** And so like you get put in this box, but like you do more than the box. And so how do you reconcile those things?

[01:03:29] **James:** Yeah. And the system is constantly like, pushing on you. Like people go to other people and you're like, like, I would like to have a say in that. Please. And, but

[01:03:38] **Stopa:** yeah.

[01:03:39] **James:** Um,

[01:03:44] **James:** and so yeah, I, it, it, it, it was both like blessing and a curse. Mm-hmm. Because we got all of Google's resources. We got like Firebase was on like every Android device.

[01:03:59] **Stopa:** Yeah.

[01:03:59] **James:** Like it is just the way you send push notifications on Androids, you use Firebase cloud messaging. And so like. Every Android developer in the world is now using Firebase and like, holy crap, that's incredible.

[01:04:10] **James:** Like, I would've never got that distribution as an independent company.

[01:04:13] **Stopa:** Mm-hmm.

[01:04:13] **James:** And there was a, you know, there was, there was a series of adjustments that I had to make to buy like my mental frame.

[01:04:21] **Stopa:** Yeah.

[01:04:22] **James:** And learn to work within, within that system.

[01:04:25] **Stopa:** Yeah. Um, I have one other curious question on this time is, you know, you, when you do the startup, especially with Andrew, right?

[01:04:32] **Stopa:** You guys must have been like, you know, 24 hours a day basically together, and then slowly you go to Google and it's not as much time probably now. No. We, we

[01:04:42] **James:** were still together all the time. Still

[01:04:43] **Stopa:** together all the time.

[01:04:44] **James:** We shared an office for all four years of Google. Wow. Yeah.

[01:04:47] **Stopa:** How about now? Do you guys, do you guys still talk?

[01:04:50] **James:** Yeah, I'm, I'm, uh, I'm on the board of his new company and yeah, I hang out with him and his, his new daughter. He's got a 1-year-old now. And so yeah, we, we, we still spend a ton of time together.

[01:05:02] **Stopa:** My question is kind of like. How, how is that experience like when the, the amount of time goes from like 10 hours a day to like two hours or less, right?

[01:05:12] **Stopa:** How, how do you kinda come up with the, it's, it's almost, at least like, this is just one fear I have for myself. 'cause all my life is like around startups, right? And I'm like, wait, let's say some, let's say this finishes. It's like, who do I, who do I talk to? Right? So how, how, how was that like, you know,

[01:05:30] **James:** I think, I think by the time we got Andrew and I would Yeah, like Google really did a number on my health and so I was like very glad to be done at the end of it.

[01:05:38] **James:** Yeah. Um, uh, so, so I mean, Andrew and I spent the next like five months, like sitting on the couch watching Netflix. Gotcha. I know. I have a good answer for you. It's alright.

[01:05:52] **Stopa:** Just get really, really worked, worked to the bone and then you won't worry about it.

[01:05:57] **James:** That, I mean, there is, there is an interesting deeper point there about Yeah, like my identity was.

[01:06:01] **James:** Yeah. Like as you probably are all familiar with San Francisco personal and professional bleed, like, you know, I, you know, show up to parties and be like, this is Mr. Firebase and Yeah. Um, so unwinding that took like, you know, a couple years Yeah. And, and the like, who am I, if not for this thing? Mm-hmm. Took a like, not, not like, yes.

[01:06:30] **James:** 'cause I was attached to it. Yeah. And, and it was just a, like, it was a groove that got worn really deep. It was like the Yeah. You know, the chains of habit are too.

[01:06:42] **Stopa:** Mm-hmm.

[01:06:43] **James:** Like to be felt until they're too heavy to be broken kind of thing. Yeah,

[01:06:48] **Stopa:** I understand that. Alright, then here's a question I have. Um, you know, you've advised now like hundreds of startups, right?

[01:06:57] **Stopa:** Or like seen this go through. So I'm curious what part. First, like what part of your journey did you think was unique to you that you then you realized actually all the startup founders are going through this. And then the second question I have is like, what do you think are the common, like what, what, what, what do you wish you, if you could put like a billboard to startup founders to give them like three things, like don't do that or do that.

[01:07:20] **Stopa:** Like, what would you tell 'em?

[01:07:25] **James:** I mean, it's, it's kind of the, the standard yc trope. Like talk, talk to, talk to your customers. Talk to your customers. Uh, what else? What do I, what would I, um, I'd maybe say do 10% founder preferred when incorporating. Alright. Uh, I would, I'm, I'm just thinking of like the non-obvious ones.

[01:07:44] **Stopa:** Yeah.

[01:07:45] **James:** Um, don't do 50 50 with your co-founder without a tie break mechanism.

[01:07:52] **James:** Mm-hmm. I've seen so many startups die that way. Just don't do it like human relationships like. All sorts of things can happen. And just like the amount of comp, like I've se I've seen like, you know, half a dozen companies die from getting deadlocked and it's, it's just painful all the way around. Um

[01:08:18] **James:** hmm. Yeah. Like choose your customer wisely.

[01:08:24] **Stopa:** Mm-hmm.

[01:08:24] **James:** You're gonna be spending a lot of time with them. Um, get out and touch the grass more often than you think you need to take care of your body. I didn't. Yeah.

[01:08:39] **Stopa:** Um,

[01:08:40] **James:** I don't know. Those are a few.

[01:08:41] **Stopa:** Yeah. Okay. Now, you know, you're working on Cradle right now. It's interesting because before I thought, oh, it's totally normal for people to do multiple startups.

[01:08:53] **Stopa:** But doing one startup, I, I'm like, wow. It is a very difficult thing to do. So I am curious what made you do it a second time?

[01:09:03] **James:** I did all of the other things. Yeah. And then realized I didn't want to do any of them. Uh, yeah. I tried, I like helped start a venture firm. I went and worked for somebody else. I worked at Accelerator called HF Zero.

[01:09:19] **James:** Yeah. Uh, I started a nonprofit during the pandemic.

[01:09:22] **Stopa:** Mm-hmm.

[01:09:23] **James:** Uh, I went and, uh, took acting classes a couple of years ago, uh, was gifted them. Oh. And yeah, all of them, all of those things. I just, I just iterated my way through them and I was like, ah, this isn't it.

[01:09:41] **Stopa:** Yeah.

[01:09:41] **James:** And I was like, building a thing with a, a small team, is it?

[01:09:46] **James:** And, and the Viktor Frankl said, if you have a big enough why you can overcome any how. And so I think the combination of that and doing it. At a more measured pace this time and also not have, not having my identity wrapped up into it. Yeah. I, I feel like I have less to prove. It's less about, yeah. Me, James.

[01:10:06] **James:** And it's more about the thing that we're doing in the world, and like, if it all goes to zero, it all goes to zero and like mm-hmm. Being okay with that is, I think takes a lot of the load off and I think I'm just doing it. I don't know. I'm, I'm prioritizing my sleep and my health this time around and it's taking it a bit easier.

[01:10:31] **James:** I like, there's three of us, so like, talk to me when there's a hundred and maybe I'll have a different answer.

[01:10:41] **Stopa:** That's exciting, man. Well, I think we've, uh, we've covered a bunch. Um, is there anything that you wish I asked that I, I have.

[01:10:57] **James:** Uh, I mean, I, I guess I'd turn that over to the audience to what, what they wanna know.

[01:11:02] **Stopa:** Heck, yeah. Let's do like three questions and then, and then we can just go and, and chill.

[01:11:09] **Speaker 7:** I remember, so I read on your blog, wrote a letter to your co-founder, and I think at the bottom it said like, if I ever have to work for someone else, I'm gonna shoot myself.

[01:11:20] **Speaker 7:** Obviously you got a car. Like, cool. So it's just like, how did you, I guess, how did you reconcile that? I mean, you mentioned some of the friction points that, were you down, any anecdotes or anything that surprised you from that experience and maybe eventually got okay with it? Or you weren't okay with it?

[01:11:34] **James:** Yeah, this was the whole, I didn't get the memo that it was my company. Yeah. Like, I thought it was still, I thought it was still my company. Um, so I, yeah, I wouldn't, I wouldn't go and work for Google now like I did. I did try working for somebody else. S um, it was a smaller, smaller startup just to like, see what that was like.

[01:11:57] **James:** And once, once you've been a founder, it's like you have a, you have a degree of a, like latitude to shape a culture. Um, and I, I, like, I'm very particular on culture and how human beings treat each other in, in the containers I create. And like, there, there's, there's only a handful of people I would tr trust to create that container, if not me.

[01:12:28] **James:** Um, yeah. In, in terms of anecdotes from Google, look, Google's, Google's, in my opinion, Google is an amazing place to work if you are early in your career. But because Google has like a thousand flowers, bloom type culture and fewer top down directions you like. Like middle management ends up like just this very bureaucratic and like that middle ground is, it is a difficult place to be.

[01:13:01] **James:** Um, yeah. I I'll stop there.

[01:13:07] **Stopa:** Nice. Go for it. San Kate, uh, was there a kind of five days

[01:13:13] **Speaker 6:** square? Um, start picking up, start picking up, but not quite there off like true product great about it, but then not bad away, kind of like, you know. And at that time, like you, how do you, how do you kind of take a decision whether, whether you should persevere and you happy, uh, you have faith that this gonna work or there are other opportunities and.

[01:13:51] **Speaker 6:** Was there, was there a time like that, that fire base before that

[01:13:53] **James:** release? The, so the, the question is like, if you, have you ended up in a spot where like, things are going good but not great, and what do you do about that? Um, no, not at fire base. Fire base. It was just like, like, you know, we felt the pull immediately, uh, but with the third company involved, the Facebook chat for any website, like definitely that was the case.

[01:14:19] **James:** And time, time is your most precious resource. And if you get stuck in a, you know, a zombie startup or like something that's like growing but like not great, that, that can be a dangerous place to be. And the first question I would ask myself is, am I, is there a market here? 'cause you have like team, product and market and like great team, great product, bad market, like.

[01:14:47] **James:** You like, you're in a tough spot. You can change the team and you can change the product you like, can't change the market. And fundamentally, we were building this chat product in a market that was just like, people just weren't willing to pay. Like, and, and they, the customers weren't, the average sale value was like not where it needed to be, and there wasn't enough customers.

[01:15:07] **James:** And so Andrew and I could have built something that would've paid our salaries, but like the opportunity cost there is high. Um, and I, we kept it running for a while to like pay some of the bills, but eventually had to make the hard choice to shut it down, you know, and focused on Firebase before that we, you know, we spent two years on it and, you know, we, we, we should have learned faster, um, but didn't, so, so it's, it's tough.

[01:15:39] **James:** In summary, it's tough. Ask yourself if, like, what the market's looking like. If not run, and if that's good and if it gets validated by other people that like, Hey, there's a market here. Like run a series of experiments. Be like, we're gonna try this, we're gonna try this, we're gonna try this. Like, action gives you data and data lets you figure out a path forward.

[01:16:03] **James:** Um, and if, yeah, if like running experiments is, is a really good way to go.

[01:16:10] **Speaker 8:** Uh, thank you for giving us this wonderful talk. And I'm curious what your thesis is on investing when somebody's in a competitive market, like talked to a lot stage companies and it's, it's easy to overlook them if there is so and so's building the same thing like the way you did the market research.

[01:16:30] **Speaker 8:** Has that view changed since the first idea and brought to you, or you're still very like, play emotion?

[01:16:37] **James:** So the, the question as I understand it is how do you think about. Investing in spaces that are really competitive Yeah. For startups. Yeah. I mean it's life is, was and always will be about the people. So it's like, who are the founders?

[01:16:53] **James:** Why are they doing it? Um, you know, are they, do they have cohesion between themselves? Have they hired great people? Um, yeah. Who, who are the people? Uh, and then second of all is just looking at, looking at what they've done. Um, looking at where their traction is, looking at what the product they built is like, you know, how, how's their execution.

[01:17:18] **James:** Um, so those would be the two things I'd look at. Um, you know, like loosely in that second camp is differentiation. Like there were in 2013, I counted them. There were 42 backend as a service companies.

[01:17:32] **Stopa:** Wow.

[01:17:33] **James:** Uh, and you know, from that era, like, you know, the. There were a couple acquisitions. There was one that went to Red Hat, there was, you know, past, went to Facebook mm-hmm.

[01:17:45] **James:** And then got shut down. Um, and, and so yeah, they like in a competitive market, it Yeah. Pick, picking. Picking is largely based on execution. Founders and differentiation.

[01:18:01] **Stopa:** Thank you for investing in us in that.

[01:18:05] **James:** Pretty great

[01:18:05] **Stopa:** founders. Aw heck yeah. James. Alright. Final question. Yeah, go for it. What's your proudest moment?

[01:18:15] **Stopa:** Is it building fire? Is something else in your life? What

[01:18:18] **James:** would you say you're, something you're very, very proud about? Hmm. What a good question.

[01:18:30] **James:** I think cer certainly real in the fire base realm. It's most of the people who. If not all of the people who worked at Firebase will say it's the best job they've ever had. And many of them consider each other their best friends. Wow. Um, so that, that's really meaningful to me. Uh, and I'm really proud of that.

[01:18:54] **James:** The, you know, seven years on from leaving Google. The thing that endures is those relationships. And it, you know, I, I, as I said, I get the warm and fuzzy when I hear like, Hey, I use Fire Ace. It's one of the first things that, that like really touches me and, you know, we did a good thing and the impact of those relationships.

[01:19:16] **James:** So I'm proud of both of those things. Um, outside of Fire Base, um.

[01:19:48] **James:** Like, I'm, I'm proud of, I'm proud of the work. We, the nonprofit, the charity that we did during the Pandemic, it saved a bunch of lives and that, that was really meaningful work. Um, like 12 states went to shelter in place, uh, based on our data. So that was, that was, that felt like a really meaningful contribution.

[01:20:12] **James:** Um,

[01:20:16] **James:** yeah. I, I guess I'm, I guess I'm just proud of, yeah, proud of the relationships and the people around me. Um, I like, I'm lucky to have very good friends who show up for me when I, you know, when I'm in need. Uh, so yeah, I feel very fortunate.

[01:20:37] **Stopa:** Thank you, James.

[01:20:39] **Stopa:** Thank

[01:20:44] **Stopa:** Wow. That's a great, great question. Wow. Alright, I gotta give you a hug, James.
