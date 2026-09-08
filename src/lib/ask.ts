/** One gesture, two features: selecting a graph node also primes the chat. */
export const ASK_EVENT = 'ishant:ask';

export function prefillAsk(question: string) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: question }));
}

export function askAndScroll(question: string) {
  prefillAsk(question);
  document.getElementById('ask')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
