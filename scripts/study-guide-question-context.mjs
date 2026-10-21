// Add an explicitly reviewed adjacent prompt without widening the approved
// answer's word boundaries or counting the prompt as another selection.
export function withSourceQuestion(record,paragraphs,question,label){
 if(!question)return paragraphs;
 const text=record.en?.paragraphs?.[question.paragraph-1]?.plain;
 if(question.sourceVersion!==record.enVersion||text!==question.text||question.paragraph!==paragraphs[0]?.number-1||!/^\s*(?:\d+\.\s*)?(?:Another\s+)?(?:Question|Q)\s*[:.]/i.test(text||''))throw Error('Invalid adjacent source question: '+label);
 return [{number:question.paragraph,ranges:[{start:0,end:text.length}]},...paragraphs];
}
