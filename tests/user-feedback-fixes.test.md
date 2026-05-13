# Test Cases: User Feedback Fixes (May 2025)

---

## Fix 1: Red Underline Alignment

### Test Case 1.1 — Single-line short text
**Input:** `அவருக்கு பிடிக்கும் என்று நினைக்கிறேன்`
**Expected:** The wavy red underline appears directly below "அவருக்கு" (or whichever word has an error), NOT below the next word.

### Test Case 1.2 — Multi-line long text (wrapping)
**Input:**
```
இந்த திட்டத்தின் மூலம் மக்களுக்கு பயன் கிடைக்கும் என்று எதிர்பார்க்கப்படுகிறது. அரசு இதற்கு தகுந்த நடவடிக்கை எடுக்க வேண்டும். மக்களுக்கு கொடுக்கப்படும் சேவைகள் தரமானவையாக இருக்க வேண்டும். இவர்களுக்கு சொல்ல வேண்டிய விஷயங்கள் நிறைய உள்ளன.
```
**Expected:**
- Multiple underlines appear, each directly under its respective error word
- No underlines are shifted to the line below
- Text wrapping is identical between textarea and highlight layer

### Test Case 1.3 — Text with markdown-like characters
**Input:** `**bold text** and *italic text* should not break alignment`
**Expected:** Underlines (if any errors) still align correctly. The `**` and `*` characters should NOT cause the highlight layer to render differently from the textarea.

### Test Case 1.4 — Very long single word (no wrap disruption)
**Input:** `எதிர்பார்க்கப்படுகிறதுஎதிர்பார்க்கப்படுகிறது incorrect spacing`
**Expected:** Underline appears under the run-on word, not shifted.

### Test Case 1.5 — Multiple errors in one line
**Input:** `அவருக்கு பணம் கொடுத்து பார்த்தார் என்று சொல்ல`
**Expected:** Each red underline appears precisely under its respective error token. None bleed into adjacent words.

### How to verify visually:
1. Paste input text into the editor
2. Click "Check Text"
3. Observe: each wavy underline should sit directly below its error word
4. Resize the browser window to trigger re-wrapping — underlines must stay aligned

---

## Fix 2: Page Scroll-Up on Click

### Test Case 2.1 — Click error when page is scrolled down
**Steps:**
1. Enter a long text (300+ words) with multiple errors
2. Click "Check Text"
3. Scroll down the page so the editor is partially visible at top
4. Click on a red-underlined error word in the editor

**Expected:** The page does NOT jump/scroll upward. Only the suggestions panel scrolls internally to show the relevant suggestion card.

### Test Case 2.2 — Click error when suggestions panel has many items
**Steps:**
1. Enter text with 10+ errors
2. Click "Check Text"
3. Click on an error near the bottom of the visible text

**Expected:**
- The suggestion card scrolls into view WITHIN the suggestions panel (max-h-[520px] container)
- The main page stays at its current scroll position
- No visible jump or jitter

### Test Case 2.3 — Click error on mobile viewport (< 768px)
**Steps:**
1. Open browser DevTools → set viewport to 375px width (mobile)
2. Enter text with errors, run check
3. Click on a red-underlined error

**Expected:** On mobile, `scrollToSuggestion` returns early (no scroll). A dialog appears instead. Page should NOT scroll.

### Test Case 2.4 — Hover over error (not click)
**Steps:**
1. Enter text with errors, run check
2. Hover over a red-underlined error for ~500ms

**Expected:** A hover popover appears near the error. The page does NOT scroll. The suggestions panel scrolls internally to highlight the matching card.

### Test Case 2.5 — Rapid clicking multiple errors
**Steps:**
1. Enter text with 5+ errors visible
2. Quickly click error 1, then error 3, then error 5

**Expected:** Each click smoothly scrolls the suggestion panel to the correct card. The page never jumps.

---

## Fix 3: Tamil Sandhi (வலினம் மிகும்) Grammar Detection

### Test Case 3.1 — ப் (pa) consonant doubling
**Input:** `மக்களுக்கு பயன் கிடைக்கும்`
**Expected correction:** `மக்களுக்குப் பயன் கிடைக்கும்`
**Explanation should mention:** வலினம் மிகும் / Valinam Migum rule

### Test Case 3.2 — க் (ka) consonant doubling
**Input:** `அவர்களுக்கு கொடுத்தார்`
**Expected correction:** `அவர்களுக்குக் கொடுத்தார்`

### Test Case 3.3 — ச் (cha) consonant doubling
**Input:** `இவர்களுக்கு சொல்ல வேண்டும்`
**Expected correction:** `இவர்களுக்குச் சொல்ல வேண்டும்`

### Test Case 3.4 — த் (tha) consonant doubling
**Input:** `அதற்கு தகுந்த நடவடிக்கை`
**Expected correction:** `அதற்குத் தகுந்த நடவடிக்கை`

### Test Case 3.5 — Multiple sandhi errors in one sentence
**Input:** `செய்வதற்கு பதிலாக அவர்களுக்கு கொடுத்து பார்க்க வேண்டும்`
**Expected correction:** `செய்வதற்குப் பதிலாக அவர்களுக்குக் கொடுத்துப் பார்க்க வேண்டும்`

### Test Case 3.6 — After -று suffix + ப word
**Input:** `என்று பேசினார் அவர்`
**Expected correction:** `என்றுப் பேசினார் அவர்`

### Test Case 3.7 — Common verb compound forms
**Input:** `கொண்டு போனார் வீட்டுக்கு`
**Expected correction:** `கொண்டுப் போனார் வீட்டுக்கு`

### Test Case 3.8 — No false positive (sandhi already correct)
**Input:** `அவர்களுக்குப் பணம் கொடுக்கப்பட்டது`
**Expected:** No changes suggested — text is already correct.

### Test Case 3.9 — Mixed errors (sandhi + spelling)
**Input:** `அவருக்கு பிடிக்கும் என்று எதிரபார்க்கப்படுகிறது`
**Expected corrections:**
- `அவருக்கு பிடிக்கும்` → `அவருக்குப் பிடிக்கும்` (sandhi)
- `எதிரபார்க்கப்படுகிறது` → `எதிர்பார்க்கப்படுகிறது` (spelling)

### Test Case 3.10 — Movie dialogue context (user mentioned screenplay use-case)
**Input:**
```
நான் உன்னை காப்பாத்துவேன் என்று சொன்னேன். ஆனால் உனக்கு புரியவில்லை. இந்த கதையில் என்னுடைய பாத்திரம் என்ன என்று தெரியவில்லை.
```
**Expected corrections:**
- `உன்னை காப்பாத்துவேன்` → `உன்னைக் காப்பாத்துவேன்`
- `உனக்கு புரியவில்லை` → `உனக்குப் புரியவில்லை`
- `இந்த கதையில்` → possible sandhi correction depending on context

---

## Automated Verification Commands

```bash
# Build check (no TypeScript errors)
npx tsc --noEmit

# Run existing tests
npx vitest run

# Dev server for manual visual testing
npm run dev
```

## Browser Console Checks

```javascript
// Verify highlight div matches textarea dimensions
const ta = document.querySelector('.editor-textarea');
const hl = document.querySelector('.editor-highlight');
console.assert(
  getComputedStyle(ta).wordBreak === getComputedStyle(hl).wordBreak,
  'word-break mismatch'
);
console.assert(
  getComputedStyle(ta).overflowWrap === getComputedStyle(hl).overflowWrap,
  'overflow-wrap mismatch'
);
console.assert(
  getComputedStyle(ta).lineHeight === getComputedStyle(hl).lineHeight,
  'line-height mismatch'
);
console.assert(
  getComputedStyle(ta).fontSize === getComputedStyle(hl).fontSize,
  'font-size mismatch'
);
console.assert(
  getComputedStyle(ta).padding === getComputedStyle(hl).padding,
  'padding mismatch'
);

// Verify .change-error has no extra padding
const err = document.querySelector('.editor-highlight .change-error');
if (err) {
  const cs = getComputedStyle(err);
  console.assert(cs.paddingTop === '0px', 'error span has top padding: ' + cs.paddingTop);
  console.assert(cs.paddingBottom === '0px', 'error span has bottom padding: ' + cs.paddingBottom);
  console.assert(cs.paddingLeft === '0px', 'error span has left padding: ' + cs.paddingLeft);
  console.assert(cs.paddingRight === '0px', 'error span has right padding: ' + cs.paddingRight);
  console.log('✅ .change-error padding is zero (no alignment shift)');
}

// Verify scrollToSuggestion doesn't scroll the page
const pageBefore = window.scrollY;
document.querySelector('.editor-highlight .change-error')?.click();
setTimeout(() => {
  console.assert(
    Math.abs(window.scrollY - pageBefore) < 2,
    `Page scrolled! Before: ${pageBefore}, After: ${window.scrollY}`
  );
  console.log('✅ Page did not scroll on error click');
}, 500);
```
