const digits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
const teens = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
const scales = ["", "thousand", "million", "billion", "trillion"]
const symbols = {
  "-": "dash",
  "+": "plus",
  "=": "equals",
  "/": "slash",
  "\\": "backslash",
  "@": "at",
  "#": "hash",
  "$": "dollar",
  "%": "percent",
  "&": "and",
  "*": "asterisk",
  "_": "underscore",
  "<": "less than",
  ">": "greater than",
  "|": "vertical bar",
  "^": "caret",
  "~": "tilde",
  "`": "backtick",
  "(": "open parenthesis",
  ")": "close parenthesis",
  "[": "open bracket",
  "]": "close bracket",
  "{": "open brace",
  "}": "close brace",
  ":": "colon",
  ";": "semicolon",
  "—": "dash",
  "–": "dash",
  "−": "minus",
  "×": "times",
  "÷": "divided by",
  "£": "pound",
  "€": "euro",
  "…": ".",
  "“": "\"",
  "”": "\"",
  "‘": "apostrophe",
  "’": "apostrophe",
}

function integer(text) {
  if (text.length > 15 || (text.length > 1 && text.startsWith("0")))
    return [...text].map((digit) => digits[Number(digit)]).join(" ")
  const groups = text.match(/\d{1,3}(?=(?:\d{3})*$)/g)
  return groups
    .map((group, index) => {
      const number = Number(group)
      if (!number) return ""
      const hundreds = Math.floor(number / 100)
      const remainder = number % 100
      return [
        hundreds ? `${digits[hundreds]} hundred` : "",
        remainder < 10 ? (remainder ? digits[remainder] : "") : remainder < 20 ? teens[remainder - 10] : `${tens[Math.floor(remainder / 10)]} ${digits[remainder % 10] === "zero" ? "" : digits[remainder % 10]}`,
        scales[groups.length - index - 1],
      ].filter(Boolean).join(" ").trim()
    })
    .filter(Boolean)
    .join(" ") || "zero"
}

function normalize(text) {
  const tokens = []
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index)
    const whitespace = /^\s+/u.exec(rest)
    if (whitespace) {
      index += whitespace[0].length
      continue
    }
    const word = /^[a-zA-Z]+(?:['’][a-zA-Z]+)*/u.exec(rest)
    if (word) {
      tokens.push(word[0].replaceAll("’", "'"))
      index += word[0].length
      continue
    }
    const number = /^\d+(?:\.\d+)?/u.exec(rest)
    if (number) {
      const [whole, fraction] = number[0].split(".")
      tokens.push(integer(whole))
      if (fraction) tokens.push("point", [...fraction].map((digit) => digits[Number(digit)]).join(" "))
      index += number[0].length
      continue
    }
    const char = String.fromCodePoint(text.codePointAt(index))
    if (char === "." && /[a-zA-Z0-9]/.test(text[index - 1] ?? "") && /[a-zA-Z0-9]/.test(text[index + 1] ?? ""))
      tokens.push("dot")
    else if (char === "-" && /^\d/.test(rest.slice(1))) tokens.push("minus")
    else if (symbols[char]) tokens.push(symbols[char])
    else if (".,!?'\"".includes(char)) tokens.push(char)
    else throw new Error(`Unsupported character in English speech: ${char}`)
    index += char.length
  }
  return tokens.join(" ").trim()
}

module.exports = { normalize }
