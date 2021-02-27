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

window.wanikaniMultipleMeanings = {};

(function() {
    'use strict';

    //===================================================================
    // Initialization of the Wanikani Open Framework.
    //-------------------------------------------------------------------
    var script_name = 'Wanikani Multiple Meanings';
    if (!window.wkof) {
        if (confirm(script_name+' requires Wanikani Open Framework.\nDo you want to be forwarded to the installation instructions?')) {
            window.location.href = 'https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549';
        }
        return;
    }

    // Set up settings with wkof
    wkof.include('Menu,Settings');
    wkof.ready('Menu,Settings').then(install_menu).then(load_settings).then(init);

    function install_menu() {
        wkof.Menu.insert_script_link({
            name:      script_name,
            submenu:   script_name,
            title:     `Settings`,
            on_click:  open_settings
        });
    }

    function load_settings() {
        const defaults = {
          skipButtonDisabled: false,
        };
        return wkof.Settings.load(script_name, defaults);
    }

    function open_settings() {
        const config = {
            script_id: script_name,
            title: script_name,
            on_save: update_settings,
            content: {
                skipButtonDisabled: {
                    type: 'checkbox',
                    label: 'Skip buttton disabled',
                    default: false,
                }
            }
        }
        const dialog = new wkof.Settings(config);
        dialog.open();
    }

    function update_settings() {
        if (!wkof.settings[script_name].skipButtonDisabled) {
            injectSkipButton();
        }
    }

    /* Eventlistener for when the currentItem changes, which then:
     *  1. updates the lastItemID and removes the last Eventlistener for the lastItemID
     *     if the currentItem changed
     *  2. sets a new evenListener on the currentItemId which then handles the answer process
     *     , and the wanikaniMultipleMeanings state gets updated with the new currentItem obj
     *     and we create an empty set for the correctMeanings that track how many meanings the
     *     user has gotten correct
     */
    $.jStorage.listenKeyChange('currentItem', () => {
        const currentItemId = getCurrenItemId();

        // If it is a new currenItem then remove the last itemlistener and updated state
        if(currentItemId !== window.wanikaniMultipleMeanings.lastItemId) {
            if (window.wanikaniMultipleMeanings.lastItemId !== undefined) {
               $.jStorage.stopListening(window.wanikaniMultipleMeanings.lastItemId); 
            }

            window.wanikaniMultipleMeanings.lastItemId = currentItemId;
        }

        if (getGurrentItemType() === 'kanji' && $.jStorage.get('questionType') === "meaning") {
            $.jStorage.listenKeyChange(currentItemId, () => {
                if ($.jStorage.get('questionType') === "meaning") {
                    handleAnswer();
                }
            });
            window.wanikaniMultipleMeanings.currentItem = {
                obj: $.jStorage.get(currentItemId),
                meanings: new Set()
            };
            injectMeaningsScore();
        }
    });

    /*
     * Function to check if value is empty
     */
    function isEmpty(value) {
      return (typeof value === 'undefined' || value === null);
    }

    /*
     * Handles the process of a user answer. 
     * It checks if the answer was a meaning and correct.
     * It checks what correct meaning the users answer is closest to and adds it to the correct meanings set
     * (this is to not end up with duplicate answers written incorrect in the set).
     * It updates the form (remove correct answer stuff) and removes the correct answer update from the state
     */
    function handleAnswer() {
        let currentItemId = getCurrenItemId();
        /*
         * item.rc and item.mc => Reading/Meaning Completed (if answered the item correctly)
         * item.ri and item.mi => Reading/Meaning Invalid (number of mistakes before answering correctly)
         */
        const item = $.jStorage.get(currentItemId) || {};

        const lastItem = window.wanikaniMultipleMeanings.currentItem.obj;
        if (!('mc' in item) || isEmpty(item.mc)) {
            return false;
        } else if (lastItem && item.mc == lastItem.mc) {
            return false;
        }

        // Add the meaning to the array of completed correct meanings
        const currentAnswer = $('#user-response').val();
        const [closestMatchAnswer, didPass] = closestMatch(currentAnswer, $.jStorage.get('currentItem').en);
        if (didPass) {
            window.wanikaniMultipleMeanings.currentItem.meanings.add(closestMatchAnswer);
        } else {
            return false;
        }

        if (window.wanikaniMultipleMeanings.currentItem.meanings.size > 0) {
            enableSkipButton();
        }
        
        // Check if user is done with current kanji
        const numberOfMeanings = $.jStorage.get('currentItem').en.length;
        if (numberOfMeanings === window.wanikaniMultipleMeanings.currentItem.meanings.size) {
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
        window.wanikaniMultipleMeanings.currentItem.obj = item;
        updateInjectedMeaningsScore();
    }

    /*
     * Checks which correct answe the user's answer is closest to and if it passes
     */
    function closestMatch(userInput, answers) {
        let closestAnswer;
        let closestAnswerScore = Infinity;
        for (let answer of answers) {
            const fuzzyMatchScore = levenshteinDistance(answer, userInput);

            if (fuzzyMatchScore < closestAnswerScore) {
                closestAnswer = answer;
                closestAnswerScore = fuzzyMatchScore;
            }
        }
        const tolerance = answerChecker.distanceTolerance(closestAnswer);
        const didPass = closestAnswerScore <= tolerance;
        return [closestAnswer, didPass];
    }

    /*
     * Returns the itemType of the currentItem
     */
    function getGurrentItemType() {
        const currentItem = $.jStorage.get('currentItem');
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

    /*
     * Returns the itemId of the currentItem in the form of <r|v|k><id>
     */
    function getCurrenItemId() {
        const currentItem = $.jStorage.get('currentItem');
        return getGurrentItemType().charAt(0) + currentItem.id;
    }

    /*
     * Injects the score counter into wanikani
     */
    function injectMeaningsScore() {
        const questionTypeElement = document.getElementById("question-type");

        const currentItemId = getCurrenItemId();

        const meaningsScore = document.createElement('span');
        meaningsScore.id = "meaningsScore";
        meaningsScore.textContent = ` (${window.wanikaniMultipleMeanings.currentItem
            ? (window.wanikaniMultipleMeanings.currentItem.meanings
                ? window.wanikaniMultipleMeanings.currentItem.meanings.size
                : 0)
            : 0}/${$.jStorage.get('currentItem').en.length})`;

        questionTypeElement.firstElementChild.appendChild(meaningsScore);
    }

    /*
     * Updates the injected score counter
     */
    function updateInjectedMeaningsScore() {
        const meaningsScore = document.getElementById("meaningsScore");
        meaningsScore.innerText = ` (${window.wanikaniMultipleMeanings.currentItem
            ? (window.wanikaniMultipleMeanings.currentItem.meanings
                ? window.wanikaniMultipleMeanings.currentItem.meanings.size
                : 0)
            : 0}/${$.jStorage.get('currentItem').en.length})`;
    }

    /*
     * function to inject skip button
     */
    function injectSkipButton() {
        const buttonListParent = document.getElementById('additional-content');
        const buttonList = buttonListParent.firstElementChild;

        const newListElement = document.createElement('li');
        const newListElementSpan = document.createElement('span');
        const newListElementIcon = document.createElement('i');

        newListElement.id = "option-skip-multiple-meanings";
        newListElementSpan.title = "skip meanings";
        newListElementIcon.classList.add('icon-forward');

        const button_css = `
            #additional-content ul li {
                width: 16.55%;
            }
        `;

        newListElementSpan.onclick = () => {
            if (isButtonDisabled()) {
                return false;
            }
            $('#answer-form fieldset').addClass('correct');
            $('#user-response').prop("disabled", true);
            $('#user-response').attr("disabled");

            let currentItemId = getCurrenItemId();
            const item = $.jStorage.get(currentItemId) || {};

            if (item.mc) {
                item.mc += 1;
            } else {
                item.mc = 1;
            }
            
            $.jStorage.set('questionCount', $.jStorage.get('questionCount') + 1);
            $.jStorage.set(currentItemId, item);

            disableSkipButton();
            $('#answer-form fieldset button').click();
        }

        $('head').append('<style>'+button_css+'</style>');
        newListElementSpan.appendChild(newListElementIcon);
        newListElement.appendChild(newListElementSpan);
        buttonList.appendChild(newListElement);
        disableSkipButton();
    }

    /*
     * function to disable the skip button
     */
    function isButtonDisabled() {
        const newListElement = document.getElementById('option-skip-multiple-meanings');
        return newListElement.classList.contains('disabled');
    }

    /*
     * function to disable the skip button
     */
    function disableSkipButton() {
        if (wkof.settings[script_name].skipButtonDisabled) {
            return false;
        }
        const newListElement = document.getElementById('option-skip-multiple-meanings');
        newListElement.classList.add('disabled');
    }

    /*
     * function to enable the skip button
     */
    function enableSkipButton() {
        if (wkof.settings[script_name].skipButtonDisabled) {
            return false;
        }
        const newListElement = document.getElementById('option-skip-multiple-meanings');
        newListElement.classList.remove('disabled');
    }

    function init(settings) {
        if (!settings.skipButtonDisabled) {
            injectSkipButton();
        }
    }
})();