// The shared catalog of sentence frames: common sentences with open slots, in English, written once for
// every language. Each language says how it expresses a frame (`frames` in languages/<lang>.ts), so N
// languages need N lists, not one per pair; a language without frames just has none.
//
// `en` lists English ways to say it, the first one shown; they're matched in order, so put the more
// specific frame first ("I want to {action}" before "I want {thing}"). Slots are filled with a word or
// short phrase of the given part of speech. A frame is a whole sentence unless `clause` is set, in which
// case it can also be part of one ("but it was expensive").

export type FrameSlotPos = 'noun' | 'verb' | 'adj'

export type FrameCatalogEntry = {
  id: string
  topic: 'journal' | 'questions' | 'requests' | 'greetings' | 'feelings'
  en: string[]
  slots?: Record<string, FrameSlotPos>
  clause?: boolean
}

export const FRAMES: FrameCatalogEntry[] = [
  // Journal: things you did, want and have to do.
  { id: 'today', topic: 'journal', en: ['Today I {action}.'], slots: { action: 'verb' } },
  { id: 'yesterday', topic: 'journal', en: ['Yesterday I {action}.'], slots: { action: 'verb' } },
  { id: 'tomorrow', topic: 'journal', en: ['Tomorrow I will {action}.', "Tomorrow I'm going to {action}."], slots: { action: 'verb' } },
  { id: 'want-to', topic: 'journal', en: ['I want to {action}.'], slots: { action: 'verb' } },
  { id: 'want', topic: 'journal', en: ['I want {thing}.'], slots: { thing: 'noun' } },
  { id: 'like-to', topic: 'journal', en: ['I like to {action}.'], slots: { action: 'verb' } },
  { id: 'like', topic: 'journal', en: ['I like {thing}.'], slots: { thing: 'noun' } },
  { id: 'went-to', topic: 'journal', en: ['I went to {place}.'], slots: { place: 'noun' } },
  { id: 'have-to', topic: 'journal', en: ['I have to {action}.', 'I need to {action}.'], slots: { action: 'verb' } },
  { id: 'can', topic: 'journal', en: ['I can {action}.'], slots: { action: 'verb' } },
  { id: 'cannot', topic: 'journal', en: ["I can't {action}.", 'I cannot {action}.'], slots: { action: 'verb' } },
  { id: 'dont-know', topic: 'journal', en: ["I don't know.", 'I do not know.'] },
  { id: 'dont-understand', topic: 'journal', en: ["I don't understand.", 'I do not understand.'] },
  // Feelings.
  { id: 'feel', topic: 'feelings', en: ['I feel {quality}.', 'I felt {quality}.'], slots: { quality: 'adj' } },
  { id: 'am', topic: 'feelings', en: ['I am {quality}.', "I'm {quality}.", 'I was {quality}.'], slots: { quality: 'adj' } },
  { id: 'it-was', topic: 'feelings', en: ['It was {quality}.', 'It is {quality}.', "It's {quality}."], slots: { quality: 'adj' } },
  { id: 'but-it-was', topic: 'feelings', en: ['but it was {quality}', 'but it is {quality}', "but it's {quality}"], slots: { quality: 'adj' }, clause: true },
  // Questions.
  { id: 'ask-where', topic: 'questions', en: ['Where is {place}?', "Where's {place}?"], slots: { place: 'noun' } },
  { id: 'ask-what', topic: 'questions', en: ['What is {thing}?', "What's {thing}?"], slots: { thing: 'noun' } },
  { id: 'ask-how', topic: 'questions', en: ['How is {thing}?', "How's {thing}?"], slots: { thing: 'noun' } },
  { id: 'ask-when', topic: 'questions', en: ['When will you {action}?'], slots: { action: 'verb' } },
  { id: 'ask-how-much', topic: 'questions', en: ['How much is {thing}?', 'How much does {thing} cost?'], slots: { thing: 'noun' } },
  { id: 'ask-eaten', topic: 'questions', en: ['Have you eaten yet?', 'Have you eaten?'] },
  { id: 'ask-done', topic: 'questions', en: ['Have you {action} yet?'], slots: { action: 'verb' } },
  { id: 'ask-want', topic: 'questions', en: ['Do you want {thing}?'], slots: { thing: 'noun' } },
  { id: 'ask-yes-no', topic: 'questions', en: ['Do you {action}?'], slots: { action: 'verb' } },
  // Requests.
  { id: 'help-me', topic: 'requests', en: ['Can you help me?', 'Please help me.'] },
  { id: 'give-me', topic: 'requests', en: ['Please give me {thing}.', 'Give me {thing}.', 'Can I have {thing}?'], slots: { thing: 'noun' } },
  { id: 'lets', topic: 'requests', en: ["Let's {action}."], slots: { action: 'verb' } },
  // Greetings.
  { id: 'hello', topic: 'greetings', en: ['Hello.', 'Hi.'] },
  { id: 'thanks', topic: 'greetings', en: ['Thank you.', 'Thanks.'] },
  { id: 'sorry', topic: 'greetings', en: ["I'm sorry.", 'Sorry.'] },
  { id: 'goodbye', topic: 'greetings', en: ['Goodbye.', 'Bye.', 'See you later.'] },
  { id: 'good-night', topic: 'greetings', en: ['Good night.'] },
]
