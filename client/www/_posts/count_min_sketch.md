---
title: Count-Min Sketches in JS
date: '2025-10-13'
authors: stopachka
---

<div class="text-lg italic font-medium">
Our teammate Daniel introduced Count-Min Sketches in Instant (a sync engine you can spin up in less than a minute). I got into a rabbit hole learning more about them and ended up writing out this essay in the process.
</div>

PG Wodehouse was a prolific author. Once he got his stride he published about a book a year until his dying day. And Wodehouse was funny. He often used eccentric [^2] adjectives: instead of "Freddie walked over", he would say "Freddie (shimmied | beetled | ambled) over".

You may wonder, how many times did Wodehouse use the word "beetle"?

Well I could tell you _approximately_ how many times Wodehouse used any word in his entire lexicon, just by loading the data-structure embedded in this image:

<div class="flex justify-center">
  <img class="m-0" src="/posts/count_min_sketch/compressedSketch.png" />
</div>

Compressed, it's 50 kilobytes and covers a 23 megabyte text file, or 3.7 million words. We can use it to answer count estimates with 0.05% error rate and 99% confidence. (If you aren't familiar with the probability terms here, no worries, we'll go over them in this essay.)

You can try it yourself right here:

<sketch-demo demo="intro-try-sketch"></sketch-demo>

# The Count-Min Sketch

The magic needed to make this happen is called the **Count-Min Sketch** — a data structure that can give you frequency estimates over giant amounts of data _without_ becoming a giant object itself.

You could use it to make passwords safer: track all known passwords on the internet, and detect whenever someone chooses a common password. [^3]

Or you could use it estimate the popularity of links: update a sketch whenever a user looks at a tweet, and you can query for approximate views. [^4]

Or, use it to make databases faster: track the values of different columns, so you can estimate how many rows a filter would return. This is what we use them in Instant: our query planner decides which indexes and join orders to use based on the estimates we get from sketches. [^5]

So how do Count-Min sketches work? In this essay we'll find out by building one from scratch, in Javascript!

# Setup

Let's dust off Bun [^6] and spin up a project:

```bash
mkdir sketches
cd sketches
bun init
cat > wodehouse.txt << 'EOF'
At the open window of the great library of Blandings Castle,
drooping like a wet sock, as was his habit when he had nothing
to prop his spine against, the Earl of Emsworth, that amiable
and boneheaded peer, stood gazing out over his domain.
EOF
```

We've just made an `index.ts` file, and a little toy `wodehouse.txt` that we can play with as we go along.

Time to `bun run --watch`, and we're ready to hack!

```bash
bun run --watch index.ts
```

# An exact solution

First things first: let's write a straightforward algorithm. If we wanted to count words _exactly_, how would we do it?

Well we could read `wodehouse.txt`, parse each word and count them. Here we go:

```typescript
// index.ts
import fs from 'fs';

// 1. Read the file
const wodehouse = fs.readFileSync('wodehouse.txt', 'utf-8');

// 2. Split it into words
function toWords(text: string): string[] {
  return text
    .split('\n')
    .flatMap((line) => line.split(' '))
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w);
}

// 3. Get exact counts
function countWords(words: string[]): { [w: string]: number } {
  const result: { [w: string]: number } = {};
  for (const word of words) {
    result[word] = (result[word] || 0) + 1;
  }
  return result;
}

const exactCounts = countWords(toWords(wodehouse));

console.log('exactCounts', exactCounts);
```

This logs a little map in our terminal:

```bash
exactCounts {
  at: 1,
  the: 3,
  // ...
  "castle,": 1,
  drooping: 1,
  // ...
  "domain.": 1,
}
```

It works, but we'll have a few problems.

## Stems

What if the word "castle" was used without a comma? Or if instead of "drooping" Wodehouse wrote "drooped"?

We would get different counts. It would be nice if we could normalize each word so no matter how Wodehouse wrote "droop", we'd get the same count.

This is a common natural-language processing task called "[stemming](https://en.wikipedia.org/wiki/Stemming)". There are some great algorithms and libraries for this, but for our essay we can write a rough function ourselves:

```typescript
// index.ts
// ...
// 2. Split it into words
function stem(word: string) {
  let w = word.toLowerCase().replaceAll(/[^a-z]/g, "");
  if (w.endsWith("ing") && w.length > 4) {
    w = w.slice(0, -3);
  } else if (w.endsWith("ed") && w.length > 3) {
    w = w.slice(0, -2);
  } else if (w.endsWith("s") && w.length > 3 && !w.endsWith("ss")) {
    w = w.slice(0, -1);
  } else if (w.endsWith("ly") && w.length > 3) {
    w = w.slice(0, -2);
  } else if (w.endsWith("er") && w.length > 4) {
    w = w.slice(0, -2);
  } else if (w.endsWith("est") && w.length > 4) {
    w = w.slice(0, -3);
  }
  return w;
}

function toWords(text: string): string[] {
  return text.split(' ').map(stem);
}
// ...
```

With it our console.log starts to show stemmed words:

```bash
exactCounts {
  at: 1,
  the: 3,
  // ...
  castle: 1, // No more `,`
  droop: 1, // No more `ing`!
  // ...
  "domain": 1, // No more `.`
}
```

And now we have better exact counts. But there's another problem.

## Growth

What happens when you look at more words? Our `exactCounts` grows with the vocabulary of `words`:

<sketch-demo demo="exact-counts-growth"></sketch-demo>

This isn't _too big_ of an issue with Wodehouse specifically: after all the English dictionary itself could fit in memory.

But as our vocabulary gets larger, our data structure gets more annoying. Imagine if we had to track _combinations_ of words: suddenly keeping counts would take more space than the words themselves. Could we do something different?

# An intuition for sketches

Ideally, we would be able to divorce the size of our vocabulary from the size of our counts data structure. Here's one way to do that.

## Columns of Buckets

Our `exactCounts` was an unbounded hash map. Let's make a bounded version.

We can spin up a _fixed_ number of buckets. Each bucket stores a count. We then take a word, hash it, and increment its corresponding bucket. Here's how this could work:

<sketch-demo demo="single-row-insert"></sketch-demo>

When we want to know the count of word, we hash it, find the corresponding bucket, and that's our count:

<sketch-demo demo="single-row-query"></sketch-demo>

With this we've solved our growth problem! No matter how large our vocabulary gets, our buckets stay a fixed size.

But of course this comes with new consequences.

## The 'sketch' in sketches.

Our counts become estimates. If you look at the demo, both 'wet' and 'castle' ended up in the second bucket. If we asked "How many times is 'castle' used?", we'd get 622.

Now, it does suck that we got 622 instead of 454 for 'castle'. But if you think about it, it's not such a big deal. Both words are used infrequently. Even when you put them together they pale in comparison to more common words. And if you're worried about errors we can already intuit a way to reduce them.

## More buckets, fewer errors

To reduce errors we can add more buckets. The more buckets we have, the fewer collisions we'll have, and the lower our chances of errors are. (You may wonder _much_ lower do our errors get? We'll get to that soon!)

<sketch-demo demo="more-buckets"></sketch-demo>

We may be feeling pretty good here, but we're not done yet. We're going to have a serious problem with high-frequency words.

## Managing frequencies

What happens if we add a word like 'like'? Say it landed where 'peer' was:

<sketch-demo demo="high-frequency"></sketch-demo>

If both 'peer' and 'like', landed in the same bucket, we'd be in for some trouble. **If we asked for the count of 'peer', we'd now get back 9,262.** That estimation is wildly inflated by 'like'. Not very useful.

If want to make our estimations better, we would need a way to reduce the chance of very-high frequency words influencing counts. How can we do this?

## Rows of Hashes

Here's one way to do reduce the influence of high-frequency words: we'll add more hashes!

We can set up a row of hash functions, each with their own buckets. To add a word, we go through each row, hash it and increment the corresponding bucket. Here's how this looks:

<sketch-demo demo="two-rows-insert"></sketch-demo>

When we want to know the count, we go through each row, find the corresponding bucket and pick the minimum value we find. [^10]

<sketch-demo demo="two-rows-query"></sketch-demo>

This is pretty cool: a particular word could get unlucky in one hash function, but as long as it gets a lucky bucket from _some_ row, we'll get a respectable count.

We can look at 'peer' again for an example. hash1 got us into the same bucket as 'like'. But hash2 got us into our own bucket. That means a better estimation! And it also means we can intuit a way to improve our confidence even more.

## More hash functions...more confidence

To improve confidence we can add more hash functions. The more hash functions we have, the higher the chance that we find at least _one_ good bucket. (You may wonder, how much more confident do we get? We'll get to that soon!)

<sketch-demo demo="more-rows-confidence"></sketch-demo>

Of course, this depends on how correlated the hash functions are. We'll want to be sure that they are independent of each other, so adding a new hash function fully shuffles around the words.

If we do this right, and we build out columns of buckets and rows of hashes, we'll have our Count-Min Sketch!

# Implementing the Sketch

Let's go ahead and write out our ideas in code then.

## Creating a sketch

We'll kick off by typing our `Sketch`:

```typescript
// index.ts

// 4. Create a sketch
type Sketch = {
  rows: number;
  columns: number;
  buckets: Uint32Array;
};
```

We keep track of a `rows`, `columns`, and all of our `buckets`. Technically `buckets` are arranged as a matrix so we _could_ use an array of arrays to store them. But if we keep buckets in a single array we can get more efficient. [^7]

To make life easier let's create a little builder function:

```typescript
// index.ts

// 4. Create a sketch
// ...
function createSketch({
  rows,
  columns,
}: {
  rows: number;
  columns: number;
}): Sketch {
  return { rows, columns, buckets: new Uint32Array(rows * columns) };
}
```

If we use it, we've got ourselves a sketch!

```typescript
const sketch = createSketch({ rows: 2, columns: 5 });

console.log('created: ', sketch);
```

Our console.log shows us a nifty object!

```bash
created: {
  rows: 2,
  columns: 5,
  buckets: Uint32Array(10) [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
}
```

## Adding words

Alright, now for the meat and potatoes. Let's implement `add`. We want to say:

1. Take a word
2. For each row, hash it and find it's corresponding bucket
3. Increment the corresponding bucket

Here we go:

```typescript
function add({ rows, columns, buckets }: Sketch, word: string) {
  for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
    const hash = Bun.hash.xxHash3(word, BigInt(rowIdx));
    const columnIdx = Number(hash % BigInt(columns));
    const globalIdx = rowIdx * columns + columnIdx;
    buckets[globalIdx]!++;
  }
}
```

We go through each row. `xxHash3` takes a seed argument. We can pass the `rowIdx` into our 'seed', so for every row we produce an independent hash value!

```typescript
const hash = Bun.hash.xxHash3(word, BigInt(rowIdx));
```

`columnIdx` tells us which bucket to use inside a particular row:

```typescript
const columnIdx = Number(hash % BigInt(columns));
```

And `globalIdx` accounts for the particular row that we we're looking at:

```typescript
const globalIdx = rowIdx * columns + columnIdx;
```

Increment that bucket, and we're done!

```typescript
buckets[globalIdx]!++;
```

We can try it out and see how it feels.

```typescript
add(sketch, stem('castle'));
console.log('after castle', sketch);
```

```bash
after castle {
  rows: 2,
  columns: 5,
  buckets: Uint32Array(10) [ 0, 0, 0, 1, 0, 0, 1, 0, 0, 0 ],
}
```

Suuper cool! Notice the two increments in `buckets`, accounting for our different rows.

## Getting counts

All that's left is to get a count. This is going to look similar to 'add'. We want to:

1. Take a word
2. For each row, hash it and nab the corresponding bucket
3. Find the minimum value from all the corresponding buckets

Let's do it:

```typescript
function check({ rows, columns, buckets }: Sketch, word: string) {
  let approx = Infinity;
  for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
    const hash = Bun.hash.xxHash3(word, BigInt(rowIdx));
    const columnIdx = Number(hash % BigInt(columns));
    const globalIdx = rowIdx * columns + columnIdx;
    approx = Math.min(approx, buckets[globalIdx]!);
  }
  return approx;
}
```

We do the same math to get our `globalIdx` for each row as we did in `add`.

We track the minimum number we see, and we have our `check`! Let's try it out:

```typescript
console.log('check castle', check(sketch, 'castle'));
```

Aaand we get our result!

```bash
check castle 1
```

Congratulations, you've implemented a Count-Min Sketch!

# Getting real

Alright, we now that we have a real Count-Min Sketch, let's put it to the test. We'll find out approximately how many times 'Beetle' is used in Wodehouse's texts.

## Get all of Wodehouse

I went ahead and compiled all 61 novels from Project Gutenberg into one giant text file. You can go ahead and download it:

```bash
curl http://instantdb.com/posts/count_min_sketch/wodehouse-full.txt \
  -o wodehouse-full.txt
```

We have a `wodehouse-full.txt` file we can play with now. Let's load it up:

```typescript
// index.ts
// ...
const allWodehouse = fs.readFileSync('wodehouse-full.txt', 'utf-8');
```

## Getting exact counts

We can use up our `toWords` and `exactCounts` to get a feel for the vocabulary:

```typescript
// index.ts
const allWodehouse = fs.readFileSync('wodehouse-full.txt', 'utf-8');
const allWords = toWords(allWodehouse);
const allExactCounts = countWords(allWords);

console.log('exact beetle', allExactCounts[stem('beetle')]);
```

If we look at "beetle", we can see it's used exactly 59 times. What would a sketch return?

## Trying out sketches

Let's create a sketch for our wodehouse words:

```typescript
// index.ts
// ...
const allSketch = createSketch({ rows: 7, columns: 4000 });
```

And add our words:

```typescript
for (const word of allWords) {
  add(allSketch, word);
}
```

Now if we check out 'beetle':

```typescript
console.log('allSketch beetle', check(allSketch, stem('beetle')));
```

We'll see 102!

```bash
allSketch beetle 102
```

A bit over, but not so bad. [^8]

If you're curious, try out different sizes and see what you get:

<sketch-demo demo="configurable-try-sketch"></sketch-demo>

# A breather to celebrate

Congratulations! You just built a Count-Min Sketch from scratch, and used it on Wodehouse.

If you'd like to see the full code example, I put this up in it's entirety on <a href="https://github.com/instantdb/count-min-sketch" target="_blank">GitHub</a>.

Hope you had a lot of fun :). If you're still curious there's more to learn here, I present to you...2 bonus sections!

# Bonus 1: Probabilities

When we created our sketch for Wodehouse, we chose some seemingly random numbers: 4000 columns and 7 rows. Is there a method to this madness?

Absolutely. We can use some math to help set bounds around our estimations.

## Error Rate & Confidence

There are two numbers we can play with:

1. The **errorRate** tells us how far off we expect our estimation to be
2. The **confidence** tells us how likely it is that we are actually within our estimation.

Let's make them concrete. The full text for Wodehouse is about 3.7 million words long (not unique words, here we are counting every occurence).

Say we want an error rate of 0.05% and a 99% confidence.

0.05% of 3.7 million is 1850. We are in effect saying:

> "You can expect the estimation we give you to be overcounted by at most 1850, and we'll be right 99% of the time"

That's pretty cool! How can we be certain like this?

## Formulas

Turns out, you can tie the `errorRate` and the `confidence` to the number of `rows` and `columns` in a sketch! Here are the formulas

Given an `errorRate`, get this many columns [^14]:

$$
columns = \frac{2}{errorRate}
$$

Given a `confidence`, get this many rows [^15]:

$$
rows = \frac{\log (1 - confidence)}{\log (1/2)}
$$

Now how did we get these formulas? Let's derive them.

## Variables

We can start by writing out some of the numbers that we just went through.

We have:

1. The `totalWords`. This tells us how many occurrences have been counted in our Sketch. For Wodehouse, that's 3.7M
2. The `errorRate`. How far off we expect our estimation to be as a percentage of totalWords. For us it's 0.05%
3. The `maximumOvercount`. Our maximum allowed overestimation for a particular `totalWords`. In our case, it's 1850).
4. The `confidence`. This tells us how likely we are to be within within our estimation. We want 99%.

And our sketch has two properties that we can influence:

1. The `columns`. This is the number of buckets in one row. We _somehow_ picked 4,000 for our Wodehouse sketch.
2. The `rows`. This is the number of hash functions in our sketch. We _somehow_ picked 7 rows for our Wodehouse sketch.

## Goal

Our goal is to relate `errorRate` and `confidence` to a specific number of `columns` and `rows`.

## Tying errorRate to columns

To build our intuition let's consider a sketch with only 1 row:

<sketch-demo demo="single-row-buckets"></sketch-demo>

Say we ask for a count of a word ('wet'). Our hash function will direct us to a bucket. What would we see if we looked into that bucket?

<sketch-demo demo="bucket-noise-breakdown"></sketch-demo>

Well it would be composed of the "actual number of times" droop was used, and the 'noise' that comes from all the other collisions that hit our bucket.

If we write this out:

$$
bucket_{word} = actualCount_{word} + noise_{word}
$$

### Expected Noise

Now here's a question: what is the expected value [^11] of our noise for a word?

The first thing we can remember is that our hash function distributes words uniformly across columns. This means that each word has a `1 / columns` chance of hitting our particular bucket.

So if we write our our expectation, it would be:

$$
expectedNoise_{word} = \frac{totalWords - actualCount_{word}}{columns}
$$

### Simplifying Noise

If you think about, do we really _need_ to subtract the $actualCount_{word}$? It's going to be such a small part of the total anyways.

We can simplify this formula by getting more conservative about what we promise. Let's just say that the the expected noise is _smaller_ than this:

$$
expectedNoise_{word} <= \frac{totalWords}{columns}
$$

Pretty cool. Now we have a simple relation for our expected noise!

### Help from Markov

But an expected value for noise isn't useful yet. It just gives us an average. What we want is the _probability_ that something is below some `maximumOvercount`.

That's where **Markov's Inequality** [^9] comes in. Markov's Inequality is a proof about random variables that says:

> For any non-negative random variable, the probability that something exceeds n times its expected value is at most 1/n.

To get concrete, if we plug in `n = 2` to Markov's Inequality, we get:

> The probability that somethings exceeds 2 times it's expected value, is at most 1 / 2

Well, our noise is a non-negative random variable [^12]. And we have it's expected value. If we use Markov's Inequality, we'll get a real probability that we can use!

$$
P(\text{Noise} > 2 \times expectedNoise_{word}) \le \frac{1}{2}
$$

### expectedNoise → maximumOvercount

Let's look at probability a bit more.

$$
P(\text{Noise} > 2 \times expectedNoise_{word}) \le \frac{1}{2}
$$

This says:

> "The probability that the noise is greater than 2 \* expectedNoise is less than or equal to 50%"

We can reverse it:

$$
P(\text{Noise} < 2 \times expectedNoise_{word}) > \frac{1}{2}
$$

Which says:

> "The probability that the noise is smaller than 2 \* expectedNoise is greater than 50%"

**If you squint, this is talking about our maximumOvercount!**. With 50% confidence, we know that we'll get an estimation smaller than `2 * expectedNoise`.

### An errorRate with 50% confidence

Now that we have a probability that uses `maximumOvercount`, let's tie that back to `errorRate`.

We said before:

> You can expect the estimation we give you to be overcounted by at most 1850

Translated to a formula, this was:

$$
3.7 \text{ million} \times 0.05\% \le 1850
$$

If we use variables:

$$
totalWords \times errorRate <= maximumOvercount;
$$

And now that we know `maximumOvercount`:

$$
totalWords \times errorRate <= 2 \times expectedNoise;
$$

And since we know `expectedNoise`:

$$
totalWords \times errorRate \le \frac{2 \times totalWords}{columns}
$$

**We've just tied errorRate and columns together!**

Let's keep going:

$$
errorRate \le \frac{2}{columns}
{} \\
{} \\
columns \ge \frac{2}{errorRate}
$$

Voila! We've just gotten a formula for columns.

### 2 / errorRate

If our goal was to get a particular error rate with 50% confidence, we could just set:

$$
columns = \frac{2}{errorRate}
{} \\
{} \\
rows = 1
$$

But 50% confidence kind of sucks. How can we improve that?

## Tying confidence to rows

Let's remember our initial Markov Inequality:

$$
P(\text{Noise} > 2 \times expectedNoise) \le \frac{1}{2}
$$

### One bad row

When `Noise > maximumOvercount`, it basically means that our estimation has failed. We've gotten a "bad row", where the bucket has highly frequent words in it.

In this case we can paraphrase this to:

$$
P(\text{row is bad}) \le \frac{1}{2}
$$

Now what happens if we add more rows? Consider 2 rows. What is the chance that _both_ rows are bad?

$$
P(\text{2 rows are bad}) \le \left(\frac{1}{2}\right)^{2}
$$

1/4. This generalizes.

### All bad rows

Given some number of rows, what is the probability that _all_ rows are bad?

$$
P(\text{all rows are bad}) \le \left(\frac{1}{2}\right)^{rows}
$$

And now that we know the formula for "all rows are bad", we actually _also_ know the formula for confidence.

### Confidence

As long as we get 1 good row, we know that we'll return within our estimation. So what's the probability of _at least_ 1 good row?

$$
confidence = 1 - P(\text{all rows are bad})
$$

It's just the complement of getting all bad rows! Now we can expand it out:

$$
confidence = 1 - \left(\frac{1}{2}\right)^{rows}
$$

Isolate the term for rows:

$$
\left(\frac{1}{2}\right)^{rows} = 1 - confidence
$$

Use some logs:

$$
rows \times log(1/2) = log(1 - confidence)
$$

And you've got a formula for rows! [^16]

$$
rows = \frac{\log (1 - confidence)}{\log(1/2)}
$$

## Fin

And voila, you got formulas for both `columns` and `rows`!

$$
columns = \frac{2}{errorRate}
{} \\
{} \\
rows = \frac{\log (1 - confidence)}{\log (1/2)}
$$

## Formulas to Code

So if we wanted an error rate of 0.05% and a confidence of 99%, how many rows and columns would we need? Let's calculate it in Javascript:

```typescript
function sketchWithBounds({
  errorRate,
  confidence,
}: {
  errorRate: number;
  confidence: number;
}): Sketch {
  const columns = Math.ceil(2 / errorRate);
  const rows = Math.ceil(Math.log(1 - confidence) / Math.log(0.5));
  return createSketch({ rows, columns });
}
```

We try it out:

```typescript
const withBounds = sketchWithBounds({
  errorRate: 0.0005,
  confidence: 0.99,
});

console.log('withBounds', withBounds.columns, withBounds.rows);
```

And we got 4000 columns and 7 rows!

```typescript
withBounds 4000 7
```

# Bonus 2: PNGs

Now, you may have wondered, how did we create our cool PNG? For posterity I thought I'd write out the algorithm.

Let's start off by installing a library to create PNGs:

```bash
bun add pngjs
bun add @types/pngjs
```

Now, we'll take a series of bytes. One pixel can be expressed as `R` `G` `B` `A`, each that's one byte. So we can fit 4 bytes per pixel. Here's a quick function to do that:

```typescript
import { PNG } from 'pngjs';

function createPNG({
  width,
  buffer,
}: {
  width: number;
  buffer: Buffer;
}): Buffer {
  const bytesPerPixel = 4; // RGBA
  const height = Math.ceil(buffer.length / (width * bytesPerPixel));
  const png = new PNG({
    width,
    height,
    colorType: 6, // RGBA
  });

  for (let i = 0; i < png.data.length; i++) {
    png.data[i] = buffer[i] ?? 0;
  }

  return PNG.sync.write(png);
}
```

## A PNG for our Sketch

Now we can just pick up the `allSketch` we created before, and save it:

```typescript
fs.writeFileSync(
  'compressedSketch.png',
  createPNG({ width: 150, buffer: await Bun.zstdCompress(allSketch.buckets) }),
);
```

Aand we get our image!

<div class="flex justify-center">
  <img class="m-0" src="/posts/count_min_sketch/compressedSketch.png" />
</div>

But you may wonder, how would it look if we saved the exact counts?

## A PNG for our exact counts

Let's try that. We can pick up our `allExactCounts` [^13], and save it as a PNG too:

```typescript
const compressedExactCounts = await Bun.zstdCompress(
  JSON.stringify(allExactCounts),
);

fs.writeFileSync(
  'compressedExactCounts.png',
  createPNG({ width: 150, buffer: compressedExactCounts }),
);
```

Load it up, and we see:

<div class="flex justify-center">
  <img class="m-0" src="/posts/count_min_sketch/compressedExactCounts.png" />
</div>

Let's see them side by side:

<div class="flex items-start justify-center space-x-2">
  <div>
    <h3 class="text-center">Sketch</h3>
    <img class="m-0 ml-2" src="/posts/count_min_sketch/compressedSketch.png" />
  </div>
  <div>
    <h3>Exact Counts</h3>
    <img class="m-0" src="/posts/count_min_sketch/compressedExactCounts.png" />
  </div>
</div>

# Fin

Congratulations, you made it all the way through the bonus too!

<p>If you're into this stuff, I'd suggest reading <a href="http://dimacs.rutgers.edu/~graham/ssbd.html" target="_blank">Small Summaries for Big Data</a>. It goes over the Count-Min Sketch, as well as a bunch of other probabilistic data structures. Plus, one of the co-authors invented the Count-Min Sketch!
</p>

_Thanks to Joe Averbukh, Daniel Woelfel, Predrag Gruevski, Irakli Safareli, Nicole Garcia Fischer, Irakli Popkhadze, Mark Shlick, Ilan Tzitrin, Drew Harris, for reviewing drafts of this essay_

[^1]: A sync engine you can try [without even signing up](/tutorial)!

[^2]: "Eccentric adjectives" are another Wodehouse-ism. He'd often use adjectives on nouns, like "I lit a thoughtful cigarette"

[^3]: See this [interesting paper](https://www.usenix.org/legacy/event/hotsec10/tech/full_papers/Schechter.pdf)

[^4]: I _think_ [X](https://web.archive.org/web/20170707141519/https://skillsmatter.com/skillscasts/6844-count-min-sketch-in-real-data-applications) is doing this, though I am not sure.

[^5]: Join orders as an example can make a world of a difference in query performance. Imagine two joins, where one returns 10 rows, and the other returns 1 million. If we fetch 10 million rows first, we're going to do a _lot_ of extra work. For the clojure enthusiasts, some of the code behind this lives [here](https://github.com/instantdb/instant/blob/main/server/src/instant/db/datalog.clj#L1349).

[^6]: Bun's standard library comes with a bunch of cool hashing and compression functions, so we won't have to install extra packages to get our algorithms working:

[^7]: If we used a 2D array, each subarray would live in a separate place in memory. When we iterate, the CPU would have to jump around different places in memory, which would make its cache less useful.

[^8]: You may be wondering: can we improve the error rate even more? Yes. One idea: [conservative updating](https://en.wikipedia.org/wiki/Count%E2%80%93min_sketch#Reducing_bias_and_error).

[^9]: This is a great [explainer](https://www.youtube.com/watch?v=onZSWfbTeho) on Markov's inequality.

[^10]: Why do we pick the minimum value across rows? Well, when we added a word, we incremented the corresponding bucket in _every_ row. This means we know that at the minimum, a corresponding bucket will record the true count of our word. If some rows show a larger count, it's because other words have collided and influenced the counts there.

[^11]: An Expected Value is a weighted average. This [video](https://www.youtube.com/watch?v=CBgCR1kHSUI) explains it well.

[^12]: It's non-negative because we only ever increment buckets.

[^13]: You may wonder, is JSON stringify an efficient way to serialize it? At a glance it feels like it isn't. But I ran a few tests with protobufs and msgpack, only to find out that JSON.stringify + zstd was more efficient. My guess is because zstd does a great job compressing the repetition in the JSON.

[^14]: The [original paper](http://dimacs.rutgers.edu/~graham/pubs/papers/cm-full.pdf) chose to pick $e$ instead of 2. This optimizes the total space the sketch takes up. But 2 is easier to reason about, so I stuck with that.

[^15]: The [original paper](http://dimacs.rutgers.edu/~graham/pubs/papers/cm-full.pdf) gets it down to $rows = \ln\!\left(\frac{1}{1 - \text{confidence}}\right)$. We chose `n = 2` in our Markov Inequality, so we could have gotten our formula down to the similar $rows = \log_{2}\!\left(\frac{1}{1 - \text{confidence}}\right)$. But this would require a few more steps with logarithms, which I wanted to avoid. The expressions are equivalent.

[^16]: If you are curious how the original paper could get the proof to the more elegant logarithm $rows = \log_{2}\!\left(\frac{1}{1 - \text{confidence}}\right)$, here's a session where ChatGPT gives a great [step-by-step solution](https://chatgpt.com/share/68f2b4c4-cb84-8003-8b1e-2883327ff18f).
