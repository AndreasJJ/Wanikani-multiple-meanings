// ==UserScript==
// @name         Wanikani Multiple Meanings
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  
// @author       Holo / Andreasjj
// @include      http://www.wanikani.com/review/session*
// @include      https://www.wanikani.com/review/session*
// @grant        none
// ==/UserScript==

window.meanings = {};

(function() {
    'use strict';

    $.jStorage.listenKeyChange('currentItem', () => {
        let currentItemId = getCurrenItemId();

        if(currentItemId !== window.meanings.lastItemId) {
            if (window.meanings.lastItemId !== undefined) {
               $.jStorage.stopListening(window.meanings.lastItemId); 
            }

            window.meanings.lastItemId = currentItemId;
        }

        if (getGurrentItemType() === 'kanji' && $.jStorage.get('questionType') === "meaning") {
            $.jStorage.listenKeyChange(currentItemId, () => {
                if ($.jStorage.get('questionType') === "meaning") {
                    isAnswerCorrect();
                }
            });
            window.meanings.currentItem = {
                obj: $.jStorage.get(currentItemId),
                meanings: new Set()
            };
            injectMeaningsScore();
        }
    })

    function isEmpty(value) {
      return (typeof value === 'undefined' || value === null);
    }

    function isAnswerCorrect() {
        let currentItemId = getCurrenItemId();
        /*
         * item.rc and item.mc => Reading/Meaning Completed (if answered the item correctly)
         * item.ri and item.mi => Reading/Meaning Invalid (number of mistakes before answering correctly)
         */
        var item = $.jStorage.get(currentItemId) || {};

        if (!('mc' in item) || isEmpty(item.mc)) {
            return false;
        } else if (window.meanings.currentItem.obj && item.mc == window.meanings.currentItem.obj.mc) {
            return false;
        }

        // Add the meaning to the array of completed correct meanings
        let currentAnswer = $('#user-response').val();
        window.meanings.currentItem.meanings.add(currentAnswer);
        
        // Check if user is done with current kanji
        let numberOfMeanings = $.jStorage.get('currentItem').en.length;
        if (numberOfMeanings === window.meanings.currentItem.meanings.size) {
        } else {
            // Remove 1 from the questionCount as it isn't done yet
            $.jStorage.set('questionCount', $.jStorage.get('questionCount') - 1);
            setTimeout(function () { 
                // Remove popup
                $('#answer-exception').remove();
                // Remove the correct class as it isn't done yet
                $('#answer-form fieldset').removeClass('correct');
                // Refocus the input
                $('#user-response').focus();
            }, 300);
            $('#user-response').prop("disabled", true);
            $('#user-response').removeAttr("disabled");
            // Remove 1 from the mc as it isn't done yet
            item.mc -= 1;
            // Remove the meaning from the input
            $('#user-response').val("");
        }
        window.meanings.currentItem.obj = item;
        updateInjectedMeaningsScore();
    }

    function getGurrentItemType() {
        let currentItem = $.jStorage.get('currentItem');
        // Get the current item type
        let currentItemType;
        if (currentItem.rad) {
            currentItemType = 'radical';
        }else if (currentItem.kan) {
            currentItemType = 'kanji';
        } else {
            currentItemType = 'vocabular';
        }
        return currentItemType;
    }

    function getCurrenItemId() {
        let currentItem = $.jStorage.get('currentItem');
        return getGurrentItemType().charAt(0) + currentItem.id;
    }

    function injectMeaningsScore() {
        let questionTypeElement = document.getElementById("question-type");

        let currentItemId = getCurrenItemId();

        let meaningsScore = document.createElement('span');
        meaningsScore.id = "meaningsScore"
        meaningsScore.textContent = ` (${window.meanings.currentItem ? (window.meanings.currentItem.meanings ? window.meanings.currentItem.meanings.size : 0) : 0}/${$.jStorage.get('currentItem').en.length})`;

        questionTypeElement.firstElementChild.appendChild(meaningsScore);
    }

    function updateInjectedMeaningsScore() {
        let meaningsScore = document.getElementById("meaningsScore");
        meaningsScore.innerText = ` (${window.meanings.currentItem ? (window.meanings.currentItem.meanings ? window.meanings.currentItem.meanings.size : 0) : 0}/${$.jStorage.get('currentItem').en.length})`;
    }
})();