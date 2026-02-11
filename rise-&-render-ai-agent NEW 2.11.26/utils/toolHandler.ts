import { FunctionCall } from "@google/genai";

export async function handleToolCall(functionCall: FunctionCall): Promise<any> {
  const { name, args } = functionCall;

  if (name === 'send_interest_form') {
    // SIMULATION: In a real app, you would call your backend API (e.g., Twilio or SendGrid) here.
    console.log(`[TOOL executed] Sending interest form to: ${args.contact_info} via ${args.method}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Return a success response to the AI so it knows it worked
    return {
      result: "success",
      message: `Successfully sent the interest form link to ${args.contact_info} via ${args.method}.`
    };
  }

  return { error: `Unknown tool: ${name}` };
}